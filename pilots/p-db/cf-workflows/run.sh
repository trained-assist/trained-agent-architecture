#!/usr/bin/env bash
# P-DB pilot, variant "Cloudflare Workflows + D1" — runs T1..T8 locally (wrangler dev / miniflare).
# One command: ./run.sh   -> run.log, results.json. Cleans up its own processes on exit.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); cd "$HERE"

# --- toolchain: wrangler 4 needs Node >= 22; the box has Node 20, so fetch a local Node 22 into bin/
if [ ! -x bin/bin/node ]; then
  V=$(curl -s https://nodejs.org/dist/index.json | python3 -c "import json,sys;print([r['version'] for r in json.load(sys.stdin) if r['version'].startswith('v22.')][0])")
  mkdir -p bin && curl -sL "https://nodejs.org/dist/$V/node-$V-linux-x64.tar.xz" | tar -xJ -C bin --strip-components=1
fi
source "$HERE/lib.sh"
[ -d node_modules/wrangler ] || NODE_ENV= npm install --silent
trap 'kill_dev' EXIT INT TERM

rm -rf state .wrangler wrangler.log; : > run.log
log() { echo "$*" | tee -a run.log; }
now() { date +%s%3N; }
st() { api GET "/status?taskId=$1"; }
brief() { st "$1" | jq -c '{status:.taskStore.status, gen:.taskStore.generation, fx:(.taskStore.side_effects|fromjson? // {}), engine:.engine.status, steps:([.taskStore.history|fromjson? // [] | .[] | select(.kind=="step_done") | .step])}'; }
wait_until() { # id jq-expr timeout_s
  local end=$(( $(date +%s) + $3 ))
  while [ "$(date +%s)" -lt "$end" ]; do st "$1" | jq -e "$2" >/dev/null 2>&1 && return 0; sleep 0.1; done; return 1; }
AWAIT='.taskStore.status=="awaiting_input"'; DONE='.taskStore.status=="done" and .engine.status=="complete"'
hist_at() { st "$1" | jq -r --arg k "$2" --arg s "$3" '[.taskStore.history|fromjson|.[]|select(.kind==$k and .step==$s)|.at]|first'; }
pass() { if eval "$1"; then echo PASS; else echo FAIL; fi; }

log "== start wrangler dev ($(node node_modules/.bin/wrangler --version)) persist=state/"
t=$(now); start_dev || exit 1; COLD1=$(( $(now) - t )); log "dev ready in ${COLD1}ms at $BASE"
api POST /init >/dev/null

# ---------------- T1 happy path
log "== T1 happy path"
T1_0=$(now); api POST /start '{"taskId":"ut-pilot-1"}' >> run.log
wait_until ut-pilot-1 "$AWAIT" 20; api POST /signal '{"taskId":"ut-pilot-1","payload":{"answer":"да"}}' >/dev/null
wait_until ut-pilot-1 "$DONE" 20; T1_MS=$(( $(now) - T1_0 ))
T1=$(brief ut-pilot-1); log "T1 state: $T1"
T1_LAT=$(( $(hist_at ut-pilot-1 step_done apply) - $(hist_at ut-pilot-1 signal user_reply) ))
log "T1 wall=${T1_MS}ms signal->apply=${T1_LAT}ms"
R1=$(pass '[ "$(jq -r ".status+\":\"+(.steps|length|tostring)+\":\"+(.fx.apply|tostring)" <<<"$T1")" = "done:5:1" ]')

# ---------------- T4 early signal (signal before the instance reaches waitFor)
log "== T4 early signal"
api POST /start '{"taskId":"ut-pilot-4","input":{"pauseAfterRunSec":3}}' >/dev/null
api POST /signal '{"taskId":"ut-pilot-4","payload":{"answer":"да"}}' >> run.log
wait_until ut-pilot-4 "$DONE" 30
T4=$(brief ut-pilot-4); SIG4=$(hist_at ut-pilot-4 signal user_reply); WAIT4=$(hist_at ut-pilot-4 status wait)
log "T4 state: $T4 ; signal.at=$SIG4 waitFor-reached.at=$WAIT4 (signal earlier by $((WAIT4-SIG4))ms)"
R4=$(pass '[ "$SIG4" -lt "$WAIT4" ] && [ "$(jq -r ".status+\":\"+(.fx.apply|tostring)" <<<"$T4")" = "done:1" ]')

# ---------------- T5 duplicate signal
log "== T5 duplicate signal"
api POST /start '{"taskId":"ut-pilot-5"}' >/dev/null; wait_until ut-pilot-5 "$AWAIT" 20
api POST /signal '{"taskId":"ut-pilot-5","payload":{"answer":"да"}}' >/dev/null
api POST /signal '{"taskId":"ut-pilot-5","payload":{"answer":"да"}}' >/dev/null
wait_until ut-pilot-5 "$DONE" 20; sleep 2
T5_LATE=$(api POST /signal '{"taskId":"ut-pilot-5","payload":{"answer":"да"}}' | jq -c .)
sleep 1; T5=$(brief ut-pilot-5)
NSIG5=$(st ut-pilot-5 | jq '[.taskStore.history|fromjson|.[]|select(.kind=="signal")]|length')
log "T5 state: $T5 ; signals logged=$NSIG5 ; 3rd signal after done -> $T5_LATE"
R5=$(pass '[ "$(jq -r ".status+\":\"+(.fx.apply|tostring)" <<<"$T5")" = "done:1" ]')

# ---------------- T6 fencing
log "== T6 fencing"
api POST /start '{"taskId":"ut-pilot-6"}' >/dev/null; wait_until ut-pilot-6 "$AWAIT" 20
T6_BEFORE=$(brief ut-pilot-6)
T6_BUMP=$(api POST /bump-generation '{"taskId":"ut-pilot-6"}' | jq -c .)
T6_STALE=$(api POST /stale-write '{"taskId":"ut-pilot-6","generation":1,"step":"apply"}' | jq -c .)
T6_AFTER=$(brief ut-pilot-6)
log "T6 before=$T6_BEFORE bump=$T6_BUMP stale-write(gen1)=$T6_STALE after=$T6_AFTER"
# the running workflow instance itself holds generation 1 -> its apply step must be fenced too
api POST /signal '{"taskId":"ut-pilot-6","payload":{"answer":"да"}}' >/dev/null
wait_until ut-pilot-6 '.engine.status=="errored"' 20
T6_ENGINE=$(brief ut-pilot-6); T6_ERR=$(st ut-pilot-6 | jq -c '.engine.error')
NFENCED6=$(st ut-pilot-6 | jq '[.taskStore.history|fromjson|.[]|select(.kind=="fenced")]|length')
log "T6 after stale instance signalled: $T6_ENGINE err=$T6_ERR fenced_events=$NFENCED6"
R6=$(pass '[ "$(jq -r .rejected <<<"$T6_STALE")" = true ] && [ "$(jq -c "{status,fx}" <<<"$T6_BEFORE")" = "$(jq -c "{status,fx}" <<<"$T6_AFTER")" ] && [ "$(jq -r ".status+\":\"+((.fx.apply//0)|tostring)" <<<"$T6_ENGINE")" = "awaiting_input:0" ]')

# ---------------- T7 cancel (checked again after restarts below)
log "== T7 cancel"
api POST /start '{"taskId":"ut-pilot-7"}' >/dev/null; wait_until ut-pilot-7 "$AWAIT" 20
T7_CANCEL=$(api POST /cancel '{"taskId":"ut-pilot-7"}' | jq -c .)
T7_SIG1=$(api POST /signal '{"taskId":"ut-pilot-7","payload":{"answer":"да"}}' | jq -c .)
sleep 2; log "T7 cancel=$T7_CANCEL signal-after-cancel=$T7_SIG1 state=$(brief ut-pilot-7)"

# ---------------- T3 wait without resources
log "== T3 wait with executor fully stopped"
api POST /start '{"taskId":"ut-pilot-3"}' >/dev/null; wait_until ut-pilot-3 "$AWAIT" 20
RSS_TOTAL=$(group_rss_kb); RSS_WORKERD=$(ps -o rss=,comm= -g "$(cat wr.pid)" | awk '$2=="workerd"{s+=$1} END{print s}')
log "alive while waiting: RSS total(node wrangler+esbuild+workerd)=${RSS_TOTAL}kB workerd-only=${RSS_WORKERD}kB"
ps -o pid,rss,comm -g "$(cat wr.pid)" >> run.log
kill_dev; LEFT=$(pgrep -f "$HERE/node_modules" | wc -l); log "kill -9 process group; processes left: $LEFT"
sleep 5
t=$(now); start_dev || exit 1; COLD2=$(( $(now) - t )); log "restart ready in ${COLD2}ms"
log "T3 after restart, before signal: $(brief ut-pilot-3)"
api POST /signal '{"taskId":"ut-pilot-3","payload":{"answer":"да"}}' >/dev/null
wait_until ut-pilot-3 "$DONE" 20
T3=$(brief ut-pilot-3); T3_LAT=$(( $(hist_at ut-pilot-3 step_done apply) - $(hist_at ut-pilot-3 signal user_reply) ))
log "T3 state: $T3 ; signal->apply after cold restart=${T3_LAT}ms"
R3=$(pass '[ "$LEFT" = 0 ] && [ "$(jq -r ".status+\":\"+(.fx|tostring)" <<<"$T3")" = "done:{\"apply\":1,\"prepare\":1,\"run\":1}" ]')

# ---------------- T2 crash right after step 2
log "== T2 kill -9 right after step 2 (engine has persisted 'run' output), before step 3"
api POST /start '{"taskId":"ut-pilot-2","input":{"pauseAfterRunSec":4}}' >/dev/null
wait_until ut-pilot-2 '(.engine.__LOCAL_DEV_STEP_OUTPUTS|length)>=2' 20
T2_KILLED_AT=$(brief ut-pilot-2); kill_dev; log "killed at: $T2_KILLED_AT"
t=$(now); start_dev || exit 1; COLD3=$(( $(now) - t ))
sleep 10  # > remaining 4s durable sleep
T2_NOWAKE=$(brief ut-pilot-2); log "T2 10s after restart, no external trigger: $T2_NOWAKE"
AUTO_RESUME=$(jq -r 'if .status=="awaiting_input" then "yes" else "no" end' <<<"$T2_NOWAKE")
if [ "$AUTO_RESUME" = no ]; then
  log "no automatic resume -> Port.recover() (sends no-op __wake event to unfinished instances): $(api POST /recover '{}' | jq -c .)"
fi
wait_until ut-pilot-2 "$AWAIT" 20
api POST /signal '{"taskId":"ut-pilot-2","payload":{"answer":"да"}}' >/dev/null
wait_until ut-pilot-2 "$DONE" 20
T2=$(brief ut-pilot-2); log "T2 final: $T2"
R2=$(pass '[ "$(jq -r ".status+\":\"+(.fx|tostring)" <<<"$T2")" = "done:{\"apply\":1,\"prepare\":1,\"run\":1}" ]')

# ---------------- T7 re-check after 2 restarts + recover + another signal
T7_SIG2=$(api POST /signal '{"taskId":"ut-pilot-7","payload":{"answer":"да"}}' | jq -c .)
api POST /recover '{}' >/dev/null; sleep 3
T7=$(brief ut-pilot-7); log "T7 after 2 restarts + recover + signal($T7_SIG2): $T7"
R7=$(pass '[ "$(jq -r ".status+\":\"+.engine+\":\"+((.fx.apply//0)|tostring)" <<<"$T7")" = "cancelled:terminated:0" ]')

kill_dev

# ---------------- T8 one SQL query straight from the Task Store (D1 local file, dev stopped)
log "== T8 one SQL query over Task Store"
SQL="SELECT t.id, t.status, t.generation, t.result_json,
 (SELECT json_group_object(name, count) FROM side_effects s WHERE s.task_id = t.id) AS side_effects,
 (SELECT json_group_array(json_object('kind', e.kind, 'step', e.step, 'at', e.at)) FROM (SELECT * FROM task_events WHERE task_id = t.id ORDER BY id) e) AS history
FROM tasks t WHERE t.id = 'ut-pilot-2'"
T8=$(timeout 60 node node_modules/.bin/wrangler d1 execute taskstore --local --persist-to state --json --command "$SQL" </dev/null 2>/dev/null | jq -c '.[0].results[0]')
log "SQL: $SQL"; log "T8 row: $T8"
ALL=$(timeout 60 node node_modules/.bin/wrangler d1 execute taskstore --local --persist-to state --json --command "SELECT id,status,generation,(SELECT json_group_object(name,count) FROM side_effects s WHERE s.task_id=t.id) fx FROM tasks t ORDER BY id" </dev/null 2>/dev/null | jq -c '.[0].results')
log "all tasks: $ALL"
R8=$(pass '[ "$(jq -r .status <<<"$T8")" = done ]')

LOC=$(cat src/*.ts | grep -cvE '^\s*(//|\*|/\*|$)')
jq -n --arg r1 "$R1" --arg r2 "$R2" --arg r3 "$R3" --arg r4 "$R4" --arg r5 "$R5" --arg r6 "$R6" --arg r7 "$R7" --arg r8 "$R8" \
  --argjson t1ms "$T1_MS" --argjson t1lat "$T1_LAT" --argjson t3lat "$T3_LAT" --argjson rss "$RSS_TOTAL" --argjson rssw "$RSS_WORKERD" \
  --argjson c1 "$COLD1" --argjson c2 "$COLD2" --argjson c3 "$COLD3" --arg auto "$AUTO_RESUME" --argjson loc "$LOC" \
  --argjson t2 "$T2" --argjson t3 "$T3" --argjson t4 "$T4" --argjson t5 "$T5" --argjson t6 "$T6_ENGINE" --argjson t7 "$T7" --argjson t8 "$T8" \
  --argjson t6stale "$T6_STALE" --arg ver "$(node node_modules/.bin/wrangler --version)" '{
  variant: "cf-workflows-d1", mode: "local (wrangler dev / miniflare), no Cloudflare account", wrangler: $ver,
  tests: {T1:$r1, T2:$r2, T3:$r3, T4:$r4, T5:$r5, T6:$r6, T7:$r7, T8:$r8},
  notes: {T2_auto_resume_after_kill9_without_trigger: $auto,
          T2_T3_resume_trigger: "local engine re-runs an interrupted instance only when it receives an event (signal or Port.recover __wake); no timer/alarm wake after kill -9"},
  metrics: {t1_wall_ms:$t1ms, signal_to_apply_ms:$t1lat, signal_to_apply_after_cold_restart_ms:$t3lat,
            rss_alive_total_kb:$rss, rss_alive_workerd_kb:$rssw, dev_ready_ms:[$c1,$c2,$c3],
            adapter_loc:$loc, moving_parts_local:3, moving_parts_prod:"Worker + Workflows + D1 (all managed)"},
  evidence: {T2:$t2, T3:$t3, T4:$t4, T5:$t5, T6_stale_write:$t6stale, T6_after_signal:$t6, T7:$t7, T8:$t8}}' > results.json
log "== RESULTS: T1=$R1 T2=$R2 T3=$R3 T4=$R4 T5=$R5 T6=$R6 T7=$R7 T8=$R8"
