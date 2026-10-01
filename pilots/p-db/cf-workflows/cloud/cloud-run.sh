#!/usr/bin/env bash
# Cloud smoke, issue #87 A1 — the three acceptance criteria from pilots/p-db/COMPARISON.md
# on a REAL Cloudflare account (worker p-db-a1-cloud-smoke, D1 p-db-a1-taskstore, both NEW).
#   C1 (а) an instance interrupted after step 2 continues BY ITSELF (no external trigger)
#   C2 (б) durable sleep + waitForEvent timeout fire WITHOUT any external event
#   C3 (в) deploy while an instance is waiting: it survives and resumes on the NEW code
# One command: ./cloud-run.sh  -> cloud-run.log, results.cloud.json, evidence-*
# Creates only pilot resources; deletes/overwrites nothing in prod.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); CFW=$(cd "$HERE/.." && pwd); cd "$CFW"
W="$CFW/node_modules/.bin/wrangler"; CFG="$HERE/wrangler.jsonc"
B="https://p-db-a1-cloud-smoke.skillset-apply.workers.dev"
RUN=${RUN:-$(date -u +%H%M%S)}
U="ut-cf-$RUN"                       # unique instance ids: instance ids are not reusable
LOG="$HERE/cloud-run.log"; : > "$LOG"
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
now() { python3 -c 'import time;print(int(time.time()*1000))'; }
req() { local d="${2:-}"; [ -z "$d" ] && d='{}'; curl -s -m 20 -XPOST "$B$1" -H 'content-type: application/json' -d "$d"; }
row() { curl -s -m 15 "$B/status?taskId=$1"; }
tstat() { row "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["taskStore"]["status"])' 2>/dev/null; }
hist() { row "$1" | python3 -c "
import json,sys
h=json.load(sys.stdin)['taskStore']['history']
h=json.loads(h) if isinstance(h,str) else h
print([e['at'] for e in h if e['kind']=='$2' and e.get('step')=='$3'][0])" 2>/dev/null; }
wait_status() { # taskId status timeout_s
  local end=$(( $(date +%s) + $3 ))
  while [ "$(date +%s)" -lt "$end" ]; do [ "$(tstat "$1")" = "$2" ] && return 0; sleep 1; done; return 1; }
set_version() { python3 - "$1" <<'PY'
import re, sys, pathlib
p = pathlib.Path('src/version.ts')
p.write_text(re.sub(r"PILOT_VERSION = '[^']*'", f"PILOT_VERSION = '{sys.argv[1]}'", p.read_text()))
PY
}
[ -x "$W" ] || { echo "run: NODE_ENV= npm install (in pilots/p-db/cf-workflows)"; exit 1; }
[ -f "$CFG" ] || { echo "missing $CFG"; exit 1; }

# --- instance log stream (evidence) ------------------------------------------
TAIL="$HERE/evidence-tail.jsonl"; : > "$TAIL"
"$W" -c "$CFG" tail --format json > "$TAIL" 2>&1 &
TAIL_PID=$!
trap '[ -n "${TAIL_PID:-}" ] && kill "$TAIL_PID" 2>/dev/null; set_version v1' EXIT INT TERM
sleep 8
kill -0 "$TAIL_PID" 2>/dev/null && log "wrangler tail connected (pid $TAIL_PID)" || log "WARNING: wrangler tail died early"

log "== deploy v1"; "$W" -c "$CFG" deploy 2>&1 | tee -a "$LOG" | tail -3
log "== /init"; req /init | tee -a "$LOG"

# ---------------- C1 (а) interruption after step 2, resume WITHOUT a trigger
log "== C1 crash between steps (crashRunOnce) task=$U-crash"
C1_T0=$(now)
req /start "{\"taskId\":\"$U-crash\",\"input\":{\"crashRunOnce\":true}}" >> "$LOG"
wait_status "$U-crash" awaiting_input 90 || log "C1: no awaiting_input in 90s"
C1_SIG_T=$(now)
req /signal "{\"taskId\":\"$U-crash\",\"payload\":{\"answer\":\"да\"}}" >> "$LOG"
wait_status "$U-crash" done 60 || log "C1: not done in 60s"
C1_T1=$(now)
C1_STATE=$(row "$U-crash" | jq -c '{status:.taskStore.status,fx:(.taskStore.side_effects|fromjson),
  steps:[.taskStore.history|fromjson[]|select(.kind=="step_done")|.step],result:(.taskStore.result_json|fromjson?),
  engine:.engine.status}')
C1_FIN=$(hist "$U-crash" step_done finalize); C1_FIN=${C1_FIN:-0}
log "C1 state: $C1_STATE (signal->done $((C1_FIN - C1_SIG_T))ms, wall $((C1_T1-C1_T0))ms)"
"$W" -c "$CFG" workflows instances describe task-workflow "$U-crash" > "$HERE/evidence-c1-instance.txt" 2>&1
R_C1=$(jq -r 'if .status=="done" and .fx.prepare==1 and .fx.run==1 and .fx.apply==1
  and (.steps|index("guard-crash")!=null) then "PASS" else "FAIL" end' <<<"$C1_STATE")

# ---------------- C2 (б) durable sleep fires with no external event
log "== C2 sleep 45s, no events sent task=$U-sleep"
C2_T0=$(now)
req /start "{\"taskId\":\"$U-sleep\",\"input\":{\"pauseAfterRunSec\":45}}" >> "$LOG"
sleep 10
C2_MID=$(row "$U-sleep" | jq -c '{status:.taskStore.status,
  steps:[.taskStore.history|fromjson[]|select(.kind=="step_done")|.step],
  signals:([.taskStore.history|fromjson[]|select(.kind=="signal")]|length)}')
log "C2 mid-sleep (t+10s): $C2_MID"
wait_status "$U-sleep" awaiting_input 90 || log "C2: sleep did not wake the instance in 90s"
C2_AWAKE=$(now)
C2_GAP=$(( $(hist "$U-sleep" status wait) - $(hist "$U-sleep" step_done run) ))
req /signal "{\"taskId\":\"$U-sleep\",\"payload\":{\"answer\":\"да\"}}" >> "$LOG"
wait_status "$U-sleep" done 60 || log "C2: not done in 60s"
_a=$(hist "$U-sleep" step_done apply); _s=$(hist "$U-sleep" signal user_reply); C2_LAT=$(( ${_a:-0} - ${_s:-0} ))
log "C2 signal->apply (no deploy) = ${C2_LAT}ms"
log "C2: durable sleep run->wait gap = ${C2_GAP}ms; instance woke at $((C2_AWAKE-C2_T0))ms from start with 0 events sent"
"$W" -c "$CFG" workflows instances describe task-workflow "$U-sleep" > "$HERE/evidence-c2-instance.txt" 2>&1
R_C2_SLEEP=$(jq -r 'if .status=="running" and (.steps|length)==2 and .signals==0 then "PASS" else "FAIL" end' <<<"$C2_MID")
R_C2_WAKE=$(jq -nr --argjson g "$C2_GAP" 'if $g>=43000 and $g<=60000 then "PASS" else "FAIL" end')

# ---------------- C2b waitForEvent timeout fires with no event sent
log "== C2b waitFor timeout 20s, NO signal ever task=$U-timeout"
T0=$(now)
req /start "{\"taskId\":\"$U-timeout\",\"input\":{\"waitForTimeoutSec\":20}}" >> "$LOG"
wait_status "$U-timeout" failed 90 || log "C2b: did not fail in 90s"
T1=$(now)
C2B=$(row "$U-timeout" | jq -c '{status:.taskStore.status,result:(.taskStore.result_json|fromjson?),
  wait_timeout:([.taskStore.history|fromjson[]|select(.kind=="wait_timeout")]|length),
  signals:([.taskStore.history|fromjson[]|select(.kind=="signal")]|length),engine:.engine.status}')
log "C2b state after $((T1-T0))ms: $C2B"
"$W" -c "$CFG" workflows instances describe task-workflow "$U-timeout" > "$HERE/evidence-c2b-instance.txt" 2>&1
R_C2B=$(jq -r 'if .status=="failed" and .result.reason=="user_reply_timeout" and .wait_timeout==1 and .signals==0 then "PASS" else "FAIL" end' <<<"$C2B")

# ---------------- C3 (в) deploy while the instance is waiting
log "== C3 deploy during awaiting_input task=$U-deploy"
req /start "{\"taskId\":\"$U-deploy\"}" >> "$LOG"
wait_status "$U-deploy" awaiting_input 90 || log "C3: not awaiting in 90s"
sleep 10                                 # let the instance hibernate before we look at it
C3_BEFORE=$(row "$U-deploy" | jq -c '{status:.taskStore.status,engine:.engine.status,
  version:([.taskStore.history|fromjson[]|select(.kind=="status" and .step=="wait")|(.payload|fromjson?)|.version][0])}')
DEPLOY_T0=$(now)
set_version v2
"$W" -c "$CFG" deploy 2>&1 | tee -a "$LOG" | tail -3
set_version v1
DEPLOY_T1=$(now)
sleep 60  # observed: workflow instances pick up the new code >=6s..~50s after wrangler deploy returns (issue #92)
C3_MID=$(row "$U-deploy" | jq -c '{status:.taskStore.status,engine:.engine.status}')
log "C3 before=$C3_BEFORE deploy=$((DEPLOY_T1-DEPLOY_T0))ms after=$C3_MID"
req /signal "{\"taskId\":\"$U-deploy\",\"payload\":{\"answer\":\"да\"}}" >> "$LOG"
wait_status "$U-deploy" done 420 || log "C3: not done in 420s"
_a=$(hist "$U-deploy" step_done apply); _s=$(hist "$U-deploy" signal user_reply); C3_LAT=$(( ${_a:-0} - ${_s:-0} ))
log "C3 signal->apply after deploy = ${C3_LAT}ms"
C3_AFTER=$(row "$U-deploy" | jq -c '{status:.taskStore.status,result:(.taskStore.result_json|fromjson?),
  apply_version:([.taskStore.history|fromjson[]|select(.kind=="step_done" and .step=="apply")|(.payload|fromjson?)|.version][0])}')
log "C3 after=$C3_AFTER"
"$W" -c "$CFG" workflows instances describe task-workflow "$U-deploy" > "$HERE/evidence-c3-instance.txt" 2>&1
R_C3=$(python3 -c '
import json,sys
before,mid,after=json.loads(sys.argv[1]),json.loads(sys.argv[2]),json.loads(sys.argv[3])
ok = (before["status"]=="awaiting_input" and before.get("version")=="v1"
      and mid["status"]=="awaiting_input"
      and after["status"]=="done" and after.get("result",{}).get("version")=="v2"
      and after.get("apply_version")=="v2")
print("PASS" if ok else "FAIL")' "$C3_BEFORE" "$C3_MID" "$C3_AFTER")
log "C3 verdict=$R_C3 (waiting instance survived deploy; resumed steps carry version v2); engine pre=$C3_BEFORE mid=$C3_MID"

# ---------------- leave the worker as the repo is (v1)
log "== final redeploy v1 (repo state == deployed state)"
"$W" -c "$CFG" deploy 2>&1 | tee -a "$LOG" | tail -2

# ---------------- T8: status + history from the remote Task Store in ONE SQL
log "== T8 remote D1 one-SQL query"
SQL="SELECT t.id, t.status, t.generation, t.result_json,
 (SELECT json_group_object(name, count) FROM side_effects s WHERE s.task_id = t.id) AS side_effects,
 (SELECT json_group_array(json_object('kind', e.kind, 'step', e.step, 'at', e.at, 'payload', e.payload)) FROM (SELECT * FROM task_events WHERE task_id = t.id ORDER BY id) e) AS history
 FROM tasks t WHERE t.id LIKE 'ut-cf-%' ORDER BY t.id"
"$W" -c "$CFG" d1 execute p-db-a1-taskstore --remote --json --command "$SQL" > "$HERE/evidence-d1-status.json" 2>&1
D1_ROWS=$(jq -r '.[0].results|length' "$HERE/evidence-d1-status.json" 2>/dev/null || echo 0)
log "T8 rows: $D1_ROWS"

"$W" -c "$CFG" workflows instances list task-workflow > "$HERE/evidence-instances-list.txt" 2>&1
kill "$TAIL_PID" 2>/dev/null; TAIL_PID=""

jq -n --arg run "$RUN" --arg c1 "$R_C1" --arg sleep "$R_C2_SLEEP" --arg wake "$R_C2_WAKE" \
  --arg to "$R_C2B" --arg c3 "$R_C3" --argjson gap "$C2_GAP" --argjson rows "$D1_ROWS" \
  --argjson c1lat "$((C1_FIN - C1_SIG_T))" --argjson c3lat "$C3_LAT" --argjson c2lat "$C2_LAT" --argjson wall1 "$((C1_T1-C1_T0))" \
  --argjson sleepmid "$C2_MID" --argjson timeoutstate "$C2B" --argjson before "$C3_BEFORE" \
  --argjson mid "$C3_MID" --argjson after "$C3_AFTER" \
  '{variant:"cf-workflows-d1", run:$run, mode:"real Cloudflare account (worker p-db-a1-cloud-smoke, D1 p-db-a1-taskstore)",
    criteria:{ "C1_continuation_after_crash_without_trigger":$c1,
               "C2_durable_sleep_no_external_event":$sleep,
               "C2_sleep_gap_ms":$gap,
               "C2_wake_after_sleep":$wake,
               "C2_waitFor_timeout_no_event":$to,
               "C3_deploy_while_waiting":$c3 },
    notes:{ c1_signal_to_finalize_ms:$c1lat, c2_signal_to_apply_ms:$c2lat, c3_signal_to_apply_after_deploy_ms:$c3lat, c1_wall_ms:$wall1, t8_rows:$rows },
    evidence:{ C1:$sleepmid, C2b:$timeoutstate, C3_before:$before, C3_mid:$mid, C3_after:$after },
    files:["cloud-run.log","evidence-tail.jsonl","evidence-c1-instance.txt","evidence-c2-instance.txt",
           "evidence-c2b-instance.txt","evidence-c3-instance.txt","evidence-d1-status.json","evidence-instances-list.txt"]}' \
  > "$HERE/results.cloud.json"
log "== RESULTS: C1=$R_C1 C2-sleep=$R_C2_SLEEP C2-wake=$R_C2_WAKE C2-timeout=$R_C2B C3=$R_C3"
cat "$HERE/results.cloud.json"
