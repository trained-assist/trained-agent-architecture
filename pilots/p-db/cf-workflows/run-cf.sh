#!/usr/bin/env bash
# P-DB pilot, variant "Cloudflare Workflows + D1" on a REAL Cloudflare account.
# Answers what the local run (run.sh) could not: does the platform resume instances on its own
# (after a sleep, a failed attempt, an isolate crash) and does a deploy break waiting instances?
#
# Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (Workers Scripts, Workflows, D1 edit).
# Creates a throwaway worker + workflow + D1 named p-db-pilot-<RUN> and deletes them on exit.
# Output: run-cf.log, results-cf.json.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); cd "$HERE"
RUN=${RUN:-$(date +%s)}; NAME="p-db-pilot-$RUN"; WFNAME="p-db-pilot-wf-$RUN"
KEY=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
WR="npx --no-install wrangler"; CFG=wrangler.cf.jsonc
: > run-cf.log
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a run-cf.log; }

cleanup() {
  log "== cleanup $NAME"
  $WR delete --name "$NAME" --force >>run-cf.log 2>&1 || log "worker delete failed"
  $WR workflows delete "$WFNAME" >>run-cf.log 2>&1 || true
  [ -n "${DBID:-}" ] && { $WR d1 delete "$NAME" -y >>run-cf.log 2>&1 || log "d1 delete failed"; }
  rm -f "$CFG"
}
trap cleanup EXIT

log "== wrangler $($WR --version)"
DBID=$($WR d1 create "$NAME" 2>&1 | tee -a run-cf.log | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
if [ -n "$DBID" ]; then BACKEND=d1; STORECFG="\"d1_databases\": [ { \"binding\": \"DB\", \"database_name\": \"$NAME\", \"database_id\": \"$DBID\" } ],"
else BACKEND=do-sqlite; log "D1 not available to this token -> Task Store on a SQLite Durable Object (same SQL, src/do-store.ts)"
  STORECFG='"durable_objects": { "bindings": [ { "name": "STORE", "class_name": "StoreDO" } ] }, "migrations": [ { "tag": "v1", "new_sqlite_classes": ["StoreDO"] } ],'; fi
cat > "$CFG" <<EOF
{ "name": "$NAME", "main": "src/index.ts", "compatibility_date": "2025-09-01", "workers_dev": true, $STORECFG
  "workflows": [ { "name": "$WFNAME", "binding": "WF", "class_name": "TaskWorkflow" } ] }
EOF
deploy() { # version
  $WR deploy -c "$CFG" --var "VERSION:$1" --var "PILOT_KEY:$KEY" 2>&1 | tee -a run-cf.log | grep -oE 'https://[^ ]+\.workers\.dev' | head -1; }
BASE=$(deploy v1); [ -n "$BASE" ] || { log "FATAL: deploy failed"; exit 2; }
log "deployed v1 at $BASE (db $DBID)"

# The edge sometimes answers a fresh workers.dev worker with a non-JSON page ("error code: 1042")
# before the request reaches our code. All endpoints are idempotent (start by id, signal is deduped),
# so retry until the worker itself answers; otherwise R2/R7 fail on a lost request, not on the platform.
api1() { local m=$1 p=$2 d=${3:-{\}}; if [ "$m" = GET ]; then curl -s -m 20 -H "x-pilot-key: $KEY" "$BASE$p"
        else curl -s -m 20 -XPOST -H "x-pilot-key: $KEY" -H 'content-type: application/json' "$BASE$p" -d "$d"; fi; }
api() { local out; for i in 1 2 3 4 5 6; do out=$(api1 "$@"); jq -e . >/dev/null 2>&1 <<<"$out" && { echo "$out"; return 0; }
        echo "[api retry $i] $1 $2 -> $(head -c 120 <<<"$out")" >>run-cf.log; sleep 2; done; echo "$out"; return 1; }
for i in $(seq 1 60); do api POST /init | grep -q '"ok"' && break; sleep 2; done
st() { api GET "/status?taskId=$1"; }
brief() { st "$1" | jq -c '{status:.taskStore.status, gen:.taskStore.generation, fx:(.taskStore.side_effects|fromjson? // {}),
  engine:.engine.status, ver:((.taskStore.result_json|fromjson? // {}).codeVersion),
  attempts:([.taskStore.history|fromjson? // [] | .[] | select(.kind=="attempt")]|length),
  steps:([.taskStore.history|fromjson? // [] | .[] | select(.kind=="step_done") | .step])}'; }
wait_until() { local end=$(( $(date +%s) + $3 )); while [ "$(date +%s)" -lt "$end" ]; do
  st "$1" | jq -e "$2" >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }
hist_at() { st "$1" | jq -r --arg k "$2" --arg s "$3" '[.taskStore.history|fromjson|.[]|select(.kind==$k and .step==$s)|.at]|first'; }
start() { api POST /start "{\"taskId\":\"$1\",\"input\":${2:-{\}}}" >>run-cf.log; echo >>run-cf.log; }
signal() { api POST /signal "{\"taskId\":\"$1\",\"payload\":{\"answer\":\"да\"}}"; }
AWAIT='.taskStore.status=="awaiting_input"'; DONE='.taskStore.status=="done" and .engine.status=="complete"'
ONE='{"apply":1,"prepare":1,"run":1}'
fx_is() { [ "$(jq -c '.fx' <<<"$1")" = "$ONE" ] && [ "$(jq -r .status <<<"$1")" = done ]; }
declare -A R E
res() { R[$1]=$2; E[$1]=$3; log "$1 $2 :: $3"; }

# ---- R1 happy path
t0=$(date +%s%3N); start ut-r1; wait_until ut-r1 "$AWAIT" 60; signal ut-r1 >/dev/null; wait_until ut-r1 "$DONE" 60
B=$(brief ut-r1); LAT=$(( $(hist_at ut-r1 step_done apply) - $(hist_at ut-r1 signal user_reply) ))
fx_is "$B" && res R1 PASS "$B wall=$(( $(date +%s%3N)-t0 ))ms signal->apply=${LAT}ms" || res R1 FAIL "$B"

# ---- long-running ones start now, checked later without any external trigger (no /recover!)
for id in r2 r2b r2c; do start ut-$id '{"pauseAfterRunSec":90}'; done  # durable sleep x3 (run 2: one sleeper never took its signal)
start ut-r3 '{"failOnce":"throw","retryDelaySec":30}'    # failed attempt -> platform retry timer
start ut-r4 '{"failOnce":"oom","retryDelaySec":10}'      # isolate killed mid-step
start ut-r12; start ut-r5; start ut-r6 '{"pauseAfterRunSec":120}'     # deploy during wait / during sleep

# ---- R7 early signal
start ut-r7 '{"pauseAfterRunSec":20}'; signal ut-r7 >>run-cf.log; wait_until ut-r7 "$DONE" 120
B=$(brief ut-r7); S=$(hist_at ut-r7 signal user_reply); W=$(hist_at ut-r7 status wait)
[ "$S" -lt "$W" ] && fx_is "$B" && res R7 PASS "signal earlier than waitFor by $((W-S))ms; $B" || res R7 FAIL "$B S=$S W=$W"

# ---- R8 duplicate + late signal
start ut-r8; wait_until ut-r8 "$AWAIT" 60; signal ut-r8 >/dev/null; signal ut-r8 >/dev/null; wait_until ut-r8 "$DONE" 60
LATE=$(signal ut-r8 | jq -c .); sleep 3; B=$(brief ut-r8)
fx_is "$B" && res R8 PASS "$B; late signal -> $LATE" || res R8 FAIL "$B"

# ---- R9 fencing
start ut-r9; wait_until ut-r9 "$AWAIT" 60; api POST /bump-generation '{"taskId":"ut-r9"}' >/dev/null
STALE=$(api POST /stale-write '{"taskId":"ut-r9","generation":1,"step":"apply"}' | jq -c .)
signal ut-r9 >/dev/null; wait_until ut-r9 '.engine.status=="errored"' 90; B=$(brief ut-r9)
[ "$(jq -r .rejected <<<"$STALE")" = true ] && [ "$(jq -r '.status+":"+((.fx.apply//0)|tostring)' <<<"$B")" = "awaiting_input:0" ] \
  && res R9 PASS "stale=$STALE; $B" || res R9 FAIL "stale=$STALE; $B"

# ---- R10 cancel
start ut-r10; wait_until ut-r10 "$AWAIT" 60; CAN=$(api POST /cancel '{"taskId":"ut-r10"}' | jq -c .)
SIG=$(signal ut-r10 | jq -c .); sleep 10; B=$(brief ut-r10)
[ "$(jq -r '.status+":"+.engine+":"+((.fx.apply//0)|tostring)' <<<"$B")" = "cancelled:terminated:0" ] \
  && res R10 PASS "cancel=$CAN signal-after=$SIG; $B" || res R10 FAIL "$B"

# ---- R2/R3/R4: must reach awaiting_input on their own
for id in r2 r2b r2c r3 r4; do wait_until ut-$id "$AWAIT" 300; done
for id in r2 r2b r2c r3 r4; do log "$id before signal: $(brief ut-$id)"; done

# ---- R5/R6: deploy a new version while one instance waits for input and one sleeps
wait_until ut-r5 "$AWAIT" 60
wait_until ut-r6 '[.taskStore.history|fromjson|.[]|select(.kind=="step_done" and .step=="run")]|length==1' 60
log "before deploy: r5=$(brief ut-r5) r6=$(brief ut-r6)"
# ---- R12 control: idle wait of several minutes WITHOUT a deploy (run 4: every instance that sat in
# waitFor across the deploy took 170-270 s to take its signal, one that started waiting after it 0.2 s)
IDLE=$(( $(date +%s%3N) - $(hist_at ut-r12 status wait) )); signal ut-r12 >/dev/null; wait_until ut-r12 "$DONE" 420
S=$(hist_at ut-r12 signal user_reply); A=$(hist_at ut-r12 step_done apply); B=$(brief ut-r12)
fx_is "$B" && res R12 PASS "idle ${IDLE}ms, no deploy: signal->apply=$(( A - S ))ms; $B" || res R12 FAIL "idle ${IDLE}ms; $B"
NB=$(deploy v2); log "deployed v2 ($NB) version endpoint: $(api GET /version | jq -c .)"
wait_until ut-r6 "$AWAIT" 300; log "r6 after sleep on v2: $(brief ut-r6)"

for id in r2 r2b r2c r3 r4 r5 r6; do log "signal $id -> $(signal ut-$id | jq -c .)"; done
for id in r2 r2b r2c r3 r4 r5 r6; do wait_until ut-$id "$DONE" 420; done
# signal -> step 'apply' latency per task (run 3 hinted at minutes for instances that sat idle)
for id in r1 r2 r2b r2c r3 r4 r5 r6 r7 r8; do S=$(hist_at ut-$id signal user_reply); A=$(hist_at ut-$id step_done apply)
  [ "$S" != null ] && [ "$A" != null ] && log "LAT $id signal->apply=$(( A - S ))ms" || log "LAT $id n/a S=$S A=$A"; done
OK2=0; B2=""; for id in r2 r2b r2c; do B=$(brief ut-$id); B2="$B2 $id=$B"; fx_is "$B" && OK2=$((OK2+1)) \
  || log "$id stuck, full status: $(st ut-$id | jq -c '{engine, history:(.taskStore.history|fromjson? // [])}')"; done
[ $OK2 = 3 ] && res R2 PASS "3/3 resumed after 90s sleep without trigger;$B2" || res R2 FAIL "$OK2/3 done;$B2"
B=$(brief ut-r3); fx_is "$B" && [ "$(jq .attempts <<<"$B")" -ge 2 ] && res R3 PASS "retried by platform; $B" || res R3 FAIL "$B"
B=$(brief ut-r4); fx_is "$B" && [ "$(jq .attempts <<<"$B")" -ge 2 ] && res R4 PASS "resumed after isolate OOM; $B err=$(st ut-r4 | jq -c .engine.error)" || res R4 FAIL "$B"
# Pass = a deploy does not break an in-flight instance (finishes once, exactly-once effects).
# Which code version finishes it is recorded, not asserted: run 36754338992 showed v1 for r5/r6
# but v2 for r3/r4 in the same run, i.e. the platform gives no guarantee either way.
B=$(brief ut-r5); fx_is "$B" && res R5 PASS "waited across deploy v1->v2, finished on $(jq -r .ver <<<"$B"); $B" || res R5 FAIL "$B"
B=$(brief ut-r6); fx_is "$B" && res R6 PASS "slept across deploy v1->v2, finished on $(jq -r .ver <<<"$B"); $B" || res R6 FAIL "$B"

# ---- R11 recover() is harmless in prod + one SQL query over the real D1
REC=$(api POST /recover | jq -c .); sleep 5
SQL="SELECT id,status,generation,(SELECT json_group_object(name,count) FROM side_effects s WHERE s.task_id=t.id) fx FROM tasks t ORDER BY id"
if [ "$BACKEND" = d1 ]; then ALL=$($WR d1 execute "$NAME" --remote --json --command "$SQL" 2>>run-cf.log | jq -c '.[0].results')
else ALL=$(api POST /sql "$(jq -nc --arg s "$SQL" '{sql:$s}')" | jq -c .); fi
log "recover -> $REC"; log "all tasks ($BACKEND): $ALL"
[ "$(jq '[.[]|select(.id=="ut-r1")|.status]|first' <<<"$ALL")" = '"done"' ] && [ "$(brief ut-r1 | jq -c .fx)" = "$ONE" ] \
  && res R11 PASS "recover harmless; SQL ok" || res R11 FAIL "ALL=$ALL"

J='{}'; for k in "${!R[@]}"; do J=$(jq --arg k "$k" --arg r "${R[$k]}" --arg e "${E[$k]}" '.[$k]={result:$r,evidence:$e}' <<<"$J"); done
jq -n --argjson t "$J" --arg ver "$($WR --version)" --arg run "$RUN" --argjson all "${ALL:-null}" --arg backend "$BACKEND" \
  '{variant:"cf-workflows-d1", mode:"real Cloudflare account", taskStoreBackend:$backend, wrangler:$ver, run:$run, tests:$t, tasks:$all}' > results-cf.json
log "== RESULTS: $(jq -c '.tests|map_values(.result)' results-cf.json)"
