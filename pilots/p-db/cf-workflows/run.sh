#!/usr/bin/env bash
# P-DB pilot, variant "Cloudflare Workflows + D1" — runs T1..T9 locally (wrangler dev / miniflare).
# One command: ./run.sh   -> run.log, results.json. Cleans up its own processes on exit.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); cd "$HERE"

# --- toolchain: wrangler 4 needs Node >= 22. Use the system node when it is new enough;
# otherwise fetch a Node build for THIS machine (os/arch) into bin/ (was linux-x64 only).
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)' 2>/dev/null; then
  OS=$(uname -s | tr '[:upper:]' '[:lower:]'); ARCH=$(uname -m)
  case "$ARCH" in x86_64) ARCH=x64;; aarch64) ARCH=arm64;; esac
  V=$(curl -s https://nodejs.org/dist/index.json | python3 -c "import json,sys;print([r['version'] for r in json.load(sys.stdin) if r['version'].startswith('v22.')][0])")
  mkdir -p bin && curl -sL "https://nodejs.org/dist/$V/node-$V-$OS-$ARCH.tar.xz" | tar -xJ -C bin --strip-components=1
  export PATH="$HERE/bin/bin:$PATH"
fi
source "$HERE/lib.sh"
[ -d node_modules/wrangler ] || NODE_ENV= npm install --silent
trap 'kill_dev' EXIT INT TERM

rm -rf state .wrangler wrangler.log; : > run.log
log() { echo "$*" | tee -a run.log; }
now() { python3 -c 'import time;print(int(time.time()*1000))'; }   # BSD date has no %3N
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
# NOTE: no braces in jq programs that run under `eval` (bash 3.2 on macOS re-parses the
# command substitution without the inner double quotes and brace-expands {a,b} into words).
R6=$(pass '[ "$(jq -r .rejected <<<"$T6_STALE")" = true ] && [ "$(jq -c "[.status,.fx]" <<<"$T6_BEFORE")" = "$(jq -c "[.status,.fx]" <<<"$T6_AFTER")" ] && [ "$(jq -r ".status+\":\"+((.fx.apply//0)|tostring)" <<<"$T6_ENGINE")" = "awaiting_input:0" ]')

# ---------------- T7 cancel (checked again after restarts below)
log "== T7 cancel"
api POST /start '{"taskId":"ut-pilot-7"}' >/dev/null; wait_until ut-pilot-7 "$AWAIT" 20
T7_CANCEL=$(api POST /cancel '{"taskId":"ut-pilot-7"}' | jq -c .)
T7_SIG1=$(api POST /signal '{"taskId":"ut-pilot-7","payload":{"answer":"да"}}' | jq -c .)
sleep 2; log "T7 cancel=$T7_CANCEL signal-after-cancel=$T7_SIG1 state=$(brief ut-pilot-7)"

# ---------------- T3 wait without resources
log "== T3 wait with executor fully stopped"
api POST /start '{"taskId":"ut-pilot-3"}' >/dev/null; wait_until ut-pilot-3 "$AWAIT" 20
RSS_TOTAL=$(group_rss_kb); RSS_WORKERD=$(tree_comm "$(cat wr.pid)" | awk 'index($2,"workerd"){s+=$1} END{print s+0}')
log "alive while waiting: RSS total(node wrangler+esbuild+workerd)=${RSS_TOTAL}kB workerd-only=${RSS_WORKERD}kB"
tree_comm "$(cat wr.pid)" | sed 's/^/  /' >> run.log
kill_dev; LEFT=$(pgrep -f "$HERE/node_modules" | wc -l | tr -d ' '); log "kill tree of wrangler dev; processes left: $LEFT"
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

# ---------------- T9 terminal status is immutable (issue #90)
log "== T9 late wait_timeout after done must not change status or result"
# ut-pilot-1 is terminal since T1; replay the plan's own failure write with the SAME generation.
T9_BEFORE=$(st ut-pilot-1 | jq -c '{status:.taskStore.status, result:(.taskStore.result_json|fromjson?), gen:.taskStore.generation}')
T9_LATE=$(api POST /late-wait-timeout '{"taskId":"ut-pilot-1"}' | jq -c .)
T9_STALE=$(api POST /stale-write '{"taskId":"ut-pilot-1","generation":1,"step":"apply"}' | jq -c .)
sleep 1
T9_AFTER=$(st ut-pilot-1 | jq -c '{status:.taskStore.status, result:(.taskStore.result_json|fromjson?), gen:.taskStore.generation}')
T9_EVENTS=$(st ut-pilot-1 | jq -c '{wait_timeout:([.taskStore.history|fromjson|.[]|select(.kind=="wait_timeout")]|length),
  ignored:([.taskStore.history|fromjson|.[]|select(.kind=="wait_timeout_ignored")]|length),
  rejected:([.taskStore.history|fromjson|.[]|select(.kind=="late_write_rejected")]|length)}')
# the classifier that decides WHICH reason reaches the Task Store (timeout vs any other error)
T9_CLASS=$(api POST /classify-wait-error '{"name":"WorkflowTimeoutError","message":"Execution timed out after 20000ms"}' | jq -c .)
T9_CLASS2=$(api POST /classify-wait-error '{"name":"Error","message":"could not load the Durable Object"}' | jq -c .)
log "T9 before=$T9_BEFORE late=$T9_LATE stale=$T9_STALE after=$T9_AFTER events=$T9_EVENTS"
log "T9 classify: timeout=$T9_CLASS other=$T9_CLASS2"
R9=$(pass '[ "$(jq -r .recorded <<<"$T9_LATE")" = false ] && [ "$T9_BEFORE" = "$T9_AFTER" ] \
  && [ "$(jq -r .status <<<"$T9_AFTER")" = done ] && [ "$(jq -r .rejected <<<"$T9_STALE")" = true ] \
  && [ "$(jq -r .wait_timeout <<<"$T9_EVENTS")" = 0 ] && [ "$(jq -r .ignored <<<"$T9_EVENTS")" = 1 ] \
  && [ "$(jq -r .rejected <<<"$T9_EVENTS")" = 2 ] \
  && [ "$(jq -r .isTimeout <<<"$T9_CLASS")" = true ] && [ "$(jq -r .isTimeout <<<"$T9_CLASS2")" = false ]')

# ---------------- T10 #116 outbox: crash AFTER the answer is durable, BEFORE the wake is delivered
log "== T10 #116: answer committed, delivery faulted, recovery replays the pending operation"
api POST /start '{"taskId":"ut-pilot-10"}' >/dev/null; wait_until ut-pilot-10 "$AWAIT" 20
api POST /fault '{"name":"after_commit","value":"on"}' >> run.log
T10_SUBMIT=$(api POST /signal '{"taskId":"ut-pilot-10","answer":"да"}' | jq -c .)
sleep 3
T10_MID=$(st ut-pilot-10 | jq -c '{status:.taskStore.status, waits:.durable.waits, outbox:.durable.outbox}')
log "T10 submit=$T10_SUBMIT"
log "T10 after fault (delivery must NOT have happened): $T10_MID"
T10_RECOVER=$(api POST /recover-outbox '{}' | jq -c .)
wait_until ut-pilot-10 "$DONE" 20
T10_END=$(st ut-pilot-10 | jq -c '{status:.taskStore.status,result:(.taskStore.result_json|fromjson?),
  waits:.durable.waits,outbox:[.durable.outbox[]|{kind,status,attempts,dedup_key}]}')
log "T10 recover=$T10_RECOVER"
log "T10 final: $T10_END"
R10=$(pass '[ "$(jq -r .accepted <<<"$T10_SUBMIT")" = true ] && [ "$(jq -r .delivered <<<"$T10_SUBMIT")" = false ] \
  && [ "$(jq -r .status <<<"$T10_MID")" = awaiting_input ] \
  && [ "$(jq -r "[.outbox[]|select(.kind==\"wake\" and .status==\"pending\")]|length" <<<"$T10_MID")" = 1 ] \
  && [ "$(jq -r .delivered <<<"$T10_RECOVER")" = 1 ] && [ "$(jq -r .status <<<"$T10_END")" = done ] \
  && [ "$(jq -r .result.answer <<<"$T10_END")" = "да" ]')

# ---------------- T11 #116 duplicate answer does not create a second attempt
log "== T11 #116: duplicate + late submissions"
api POST /start '{"taskId":"ut-pilot-11"}' >/dev/null; wait_until ut-pilot-11 "$AWAIT" 20
T11_A=$(api POST /signal '{"taskId":"ut-pilot-11","answer":"да","eventKey":"msg-1"}' | jq -c .)
T11_B=$(api POST /signal '{"taskId":"ut-pilot-11","answer":"да","eventKey":"msg-1"}' | jq -c .)
T11_C=$(api POST /signal '{"taskId":"ut-pilot-11","answer":"НЕТ","eventKey":"msg-2"}' | jq -c .)
wait_until ut-pilot-11 "$DONE" 20; sleep 1
T11_END=$(st ut-pilot-11 | jq -c '{status:.taskStore.status,result:(.taskStore.result_json|fromjson?),fx:(.taskStore.side_effects|fromjson?),
  waits:.durable.waits,wakeRows:([.durable.outbox[]|select(.kind=="wake")]|length),
  accepted:([.taskStore.history|fromjson? | .[] | select(.kind=="answer_accepted")]|length),
  rejected:([.taskStore.history|fromjson? | .[] | select(.kind=="answer_rejected")]|length)}')
log "T11 first=$T11_A"; log "T11 duplicate=$T11_B"; log "T11 second-key=$T11_C"
log "T11 final: $T11_END"
R11=$(pass '[ "$(jq -r .accepted <<<"$T11_A")" = true ] \
  && { [ "$(jq -r .reason <<<"$T11_B")" = duplicate ] || [ "$(jq -r .reason <<<"$T11_B")" = already_consumed ]; } \
  && [ "$(jq -r .accepted <<<"$T11_C")" = false ] && [ "$(jq -r .wakeRows <<<"$T11_END")" = 1 ] \
  && [ "$(jq -r .accepted <<<"$T11_END")" = 1 ] && [ "$(jq -r .rejected <<<"$T11_END")" = 2 ] \
  && [ "$(jq -r .fx.apply <<<"$T11_END")" = 1 ] && [ "$(jq -r .result.answer <<<"$T11_END")" = "да" ]')

# ---------------- T12 #116 cancel race: a late answer must not resume the task
log "== T12 #116: answer after cancel"
api POST /start '{"taskId":"ut-pilot-12"}' >/dev/null; wait_until ut-pilot-12 "$AWAIT" 20
T12_CANCEL=$(api POST /cancel '{"taskId":"ut-pilot-12"}' | jq -c .)
T12_LATE=$(api POST /signal '{"taskId":"ut-pilot-12","answer":"да"}' | jq -c .)
sleep 2
T12_END=$(st ut-pilot-12 | jq -c '{status:.taskStore.status,gen:.taskStore.generation,
  waits:.durable.waits,wakeRows:([.durable.outbox[]|select(.kind=="wake" and .status=="pending")]|length),
  engine:.engine.status,fx:(.taskStore.side_effects|fromjson?)}')
log "T12 cancel=$T12_CANCEL"; log "T12 late answer=$T12_LATE"; log "T12 final: $T12_END"
R12=$(pass '[ "$(jq -r .status <<<"$T12_CANCEL")" = cancelled ] && [ "$(jq -r .accepted <<<"$T12_LATE")" = false ] \
  && [ "$(jq -r .reason <<<"$T12_LATE")" = cancelled ] && [ "$(jq -r .status <<<"$T12_END")" = cancelled ] \
  && [ "$(jq -r .wakeRows <<<"$T12_END")" = 0 ] && [ "$(jq -r .fx.apply <<<"$T12_END")" = null ]')

# ---------------- T13 #116 durable crash inside the plan: the resumed instance re-reads state
log "== T13 #116: crash right after the durable wait commit; continuation from durable state, no wake"
api POST /fault '{"name":"after_open_wait","value":"on"}' >> run.log
api POST /start '{"taskId":"ut-pilot-13"}' >/dev/null
# the fault fires INSIDE the step after openWait, so the durable wait must already exist
wait_until ut-pilot-13 '.durable.waits|length>=1' 20
# commit the answer durably and DO NOT deliver any wake: the engine's step retry must read it back
api POST /answer '{"taskId":"ut-pilot-13","answer":"да","deliver":false}' >/dev/null
T13_MID=$(st ut-pilot-13 | jq -c '{status:.taskStore.status,waits:.durable.waits,outbox:[.durable.outbox[]|{kind,status}]}')
wait_until ut-pilot-13 "$DONE" 30
T13_END=$(st ut-pilot-13 | jq -c '{status:.taskStore.status,result:(.taskStore.result_json|fromjson?),
  waits:.durable.waits, outbox:[.durable.outbox[]|{kind,status,attempts}],
  wakeDelivered:([.taskStore.history|fromjson? | .[] | select(.kind=="wake_delivered")]|length)}')
log "T13 after durable answer, before any wake: $T13_MID"
log "T13 final: $T13_END"
R13=$(pass '[ "$(jq -r "[.waits[]|select(.status==\"answered\")]|length" <<<"$T13_MID")" = 1 ] \
  && [ "$(jq -r .status <<<"$T13_END")" = done ] && [ "$(jq -r .result.answer <<<"$T13_END")" = "да" ] \
  && [ "$(jq -r "[.waits[]|select(.status==\"consumed\")]|length" <<<"$T13_END")" = 1 ] \
  && [ "$(jq -r .wakeDelivered <<<"$T13_END")" = 0 ] \
  && [ "$(jq -r "[.outbox[]|select(.kind==\"wake\" and .status==\"pending\")]|length" <<<"$T13_END")" = 1 ]')

# ---------------- T14 #116 the signal payload is NOT the answer: durable state wins
log "== T14 #116: wake event carrying a WRONG answer, durable answer must win"
api POST /start '{"taskId":"ut-pilot-14"}' >/dev/null; wait_until ut-pilot-14 "$AWAIT" 20
T14_COMMIT=$(api POST /answer '{"taskId":"ut-pilot-14","answer":"да","deliver":false}' | jq -c .)
api POST /wake '{"taskId":"ut-pilot-14","type":"user_reply","payload":{"answer":"НЕТ"}}' >> run.log
wait_until ut-pilot-14 "$DONE" 20
T14_END=$(st ut-pilot-14 | jq -c '{status:.taskStore.status,result:(.taskStore.result_json|fromjson?),
  applied:([.taskStore.history|fromjson? | .[] | select(.kind=="step_done" and .step=="apply") | (.payload|fromjson?) | {used,wokeBy,eventKey}] | first)}')
log "T14 durable commit=$T14_COMMIT"; log "T14 final: $T14_END"
R14=$(pass '[ "$(jq -r .accepted <<<"$T14_COMMIT")" = true ] && [ "$(jq -r .delivered <<<"$T14_COMMIT")" = false ] \
  && [ "$(jq -r .status <<<"$T14_END")" = done ] && [ "$(jq -r .result.answer <<<"$T14_END")" = "да" ] \
  && [ "$(jq -r .applied.used <<<"$T14_END")" = "да" ]')

kill_dev

# ---------------- T8 one SQL query straight from the Task Store (D1 local file, dev stopped)
log "== T8 one SQL query over Task Store"
SQL="SELECT t.id, t.status, t.generation, t.result_json,
 (SELECT json_group_object(name, count) FROM side_effects s WHERE s.task_id = t.id) AS side_effects,
 (SELECT json_group_array(json_object('kind', e.kind, 'step', e.step, 'at', e.at)) FROM (SELECT * FROM task_events WHERE task_id = t.id ORDER BY id) e) AS history
FROM tasks t WHERE t.id = 'ut-pilot-2'"
T8=$(tmo 60 node node_modules/.bin/wrangler d1 execute taskstore --local --persist-to state --json --command "$SQL" </dev/null 2>/dev/null | jq -c '.[0].results[0]')
log "SQL: $SQL"; log "T8 row: $T8"
ALL=$(tmo 60 node node_modules/.bin/wrangler d1 execute taskstore --local --persist-to state --json --command "SELECT id,status,generation,(SELECT json_group_object(name,count) FROM side_effects s WHERE s.task_id=t.id) fx FROM tasks t ORDER BY id" </dev/null 2>/dev/null | jq -c '.[0].results')
log "all tasks: $ALL"
R8=$(pass '[ "$(jq -r .status <<<"$T8")" = done ]')

LOC=$(cat src/*.ts | grep -cvE '^\s*(//|\*|/\*|$)')
jq -n --arg r1 "$R1" --arg r2 "$R2" --arg r3 "$R3" --arg r4 "$R4" --arg r5 "$R5" --arg r6 "$R6" --arg r7 "$R7" --arg r8 "$R8" --arg r9 "$R9" \
  --arg r10 "$R10" --arg r11 "$R11" --arg r12 "$R12" --arg r13 "$R13" --arg r14 "$R14" \
  --argjson t1ms "$T1_MS" --argjson t1lat "$T1_LAT" --argjson t3lat "$T3_LAT" --argjson rss "$RSS_TOTAL" --argjson rssw "$RSS_WORKERD" \
  --argjson c1 "$COLD1" --argjson c2 "$COLD2" --argjson c3 "$COLD3" --arg auto "$AUTO_RESUME" --argjson loc "$LOC" \
  --argjson t2 "$T2" --argjson t3 "$T3" --argjson t4 "$T4" --argjson t5 "$T5" --argjson t6 "$T6_ENGINE" --argjson t7 "$T7" --argjson t8 "$T8" \
  --argjson t9before "$T9_BEFORE" --argjson t9after "$T9_AFTER" --argjson t9late "$T9_LATE" --argjson t9stale "$T9_STALE" \
  --argjson t9events "$T9_EVENTS" --argjson t9class "$T9_CLASS" --argjson t9class2 "$T9_CLASS2" \
  --argjson t10submit "$T10_SUBMIT" --argjson t10mid "$T10_MID" --argjson t10recover "$T10_RECOVER" --argjson t10end "$T10_END" \
  --argjson t11a "$T11_A" --argjson t11b "$T11_B" --argjson t11c "$T11_C" --argjson t11end "$T11_END" \
  --argjson t12cancel "$T12_CANCEL" --argjson t12late "$T12_LATE" --argjson t12end "$T12_END" \
  --argjson t13mid "$T13_MID" --argjson t13end "$T13_END" \
  --argjson t14commit "$T14_COMMIT" --argjson t14end "$T14_END" \
  --argjson t6stale "$T6_STALE" --arg ver "$(node node_modules/.bin/wrangler --version)" '{
  variant: "cf-workflows-d1", mode: "local (wrangler dev / miniflare), no Cloudflare account", wrangler: $ver,
  tests: {T1:$r1, T2:$r2, T3:$r3, T4:$r4, T5:$r5, T6:$r6, T7:$r7, T8:$r8, T9:$r9,
          T10_outbox_recovery:$r10, T11_duplicate_answer:$r11, T12_cancel_race:$r12,
          T13_crash_after_durable_wait:$r13, T14_signal_is_not_the_answer:$r14},
  notes: {T2_auto_resume_after_kill9_without_trigger: $auto,
          T2_T3_resume_trigger: "local engine re-runs an interrupted instance only when it receives an event (signal or Port.recover __wake); no timer/alarm wake after kill -9",
          durable_wait: "task_waits + task_outbox: wait/answer/continuation intent are one D1 batch; delivery is a pending operation replayed by /recover-outbox"},
  metrics: {t1_wall_ms:$t1ms, signal_to_apply_ms:$t1lat, signal_to_apply_after_cold_restart_ms:$t3lat,
            rss_alive_total_kb:$rss, rss_alive_workerd_kb:$rssw, dev_ready_ms:[$c1,$c2,$c3],
            adapter_loc:$loc, moving_parts_local:3, moving_parts_prod:"Worker + Workflows + D1 (all managed)"},
  evidence: {T2:$t2, T3:$t3, T4:$t4, T5:$t5, T6_stale_write:$t6stale, T6_after_signal:$t6, T7:$t7, T8:$t8,
             T9_late_write:{before:$t9before, attempt:$t9late, stale_write:$t9stale, after:$t9after,
                            events:$t9events, classify_timeout:$t9class, classify_other:$t9class2},
             T10_outbox_recovery:{submit:$t10submit, after_fault:$t10mid, recovery:$t10recover, final:$t10end},
             T11_duplicate_answer:{first:$t11a, duplicate:$t11b, second_key:$t11c, final:$t11end},
             T12_cancel_race:{cancel:$t12cancel, late_answer:$t12late, final:$t12end},
             T13_crash_after_durable_wait:{after_durable_answer:$t13mid, final:$t13end},
             T14_signal_is_not_the_answer:{commit:$t14commit, final:$t14end}}}' > results.json
log "== RESULTS: T1=$R1 T2=$R2 T3=$R3 T4=$R4 T5=$R5 T6=$R6 T7=$R7 T8=$R8 T9=$R9 T10=$R10 T11=$R11 T12=$R12 T13=$R13 T14=$R14"
