#!/usr/bin/env bash
# Issues #91 + #92 — deploy DURING awaiting_input, then signal N seconds after
# `wrangler deploy` returns (the reproduction written in both issues).
#
#   #91  signal -> step `apply` latency: baseline without deploy is 280-495 ms;
#        with a deploy in the window it was observed at 50 290 ms and 269 760 ms.
#   #92  the same instance used to run the PRE-deploy code when the signal arrived
#        inside the propagation window (>= 6 s after deploy returned).
#
# Variants per iteration (all on the real account, worker p-db-a1-cloud-smoke):
#   delay   — seconds between deploy return and POST /signal (2 s = #92 window, 5 s = #91 repro)
#   prewarm — /signal default: one RPC into the instance BEFORE the event is handed over
#             (records prewarmMs/sendMs on the signal event; measured NOT to change the class
#             of the outcome: fast-on-old-code vs 300 s-on-new-code)
#   resend  — a second POST /signal 10 s later when the event was not consumed
#             (at-least-once delivery; measured NOT to accelerate the wake)
#
# The signal carries expectVersion=<marker just deployed>: if the woken instance still
# runs the previous code, the plan fails the task explicitly with reason=version_mismatch
# instead of silently producing a result from the old logic (guard, issue #92).
#
# Output: probe-wake.log, probe-wake.results.json, evidence-probe-tail-runs.jsonl (raw tail
#         is filtered down to run/exception events and removed), evidence-probe-instance-<i>.txt
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); CFW=$(cd "$HERE/.." && pwd); cd "$CFW"
W="$CFW/node_modules/.bin/wrangler"; CFG="$HERE/wrangler.jsonc"
B="https://p-db-a1-cloud-smoke.skillset-apply.workers.dev"
RUN=${RUN:-$(date -u +%H%M%S)}
LOG="$HERE/probe-wake.log"; : > "$LOG"
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
now() { python3 -c 'import time;print(int(time.time()*1000))'; }
req() { local d="${2:-}"; [ -z "$d" ] && d='{}'; curl -s -m 20 -XPOST "$B$1" -H 'content-type: application/json' -d "$d"; }
get() { curl -s -m 10 "$B$1"; }
row() { get "/status?taskId=$1"; }
tstat() { row "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["taskStore"]["status"])' 2>/dev/null; }
hist() { row "$1" | python3 -c "
import json,sys
h=json.load(sys.stdin)['taskStore']['history']
h=json.loads(h) if isinstance(h,str) else h
print([e['at'] for e in h if e['kind']=='$2' and e.get('step')=='$3'][0])" 2>/dev/null; }
wait_consumed() { # taskId timeout_s -> 0 as soon as the wait step has consumed an event
  local end=$(( $(date +%s) + $2 ))
  while [ "$(date +%s)" -lt "$end" ]; do
    case "$(tstat "$1")" in done|failed|cancelled) return 0;; esac
    [ -n "$(hist "$1" step_done wait)" ] && return 0
    sleep 2
  done
  return 1
}
set_version() { python3 - "$1" <<'PY'
import re, sys, pathlib
p = pathlib.Path('src/version.ts')
p.write_text(re.sub(r"PILOT_VERSION = '[^']*'", f"PILOT_VERSION = '{sys.argv[1]}'", p.read_text()))
PY
}
edge_version() { get /version | python3 -c 'import json,sys;print(json.load(sys.stdin).get("version",""))' 2>/dev/null; }
[ -x "$W" ] || { echo "run: NODE_ENV= npm install (in pilots/p-db/cf-workflows)"; exit 1; }
[ -f "$CFG" ] || { echo "missing $CFG"; exit 1; }

# --- tail (same condition as cloud-run.sh: the original observations were taken with a live tail)
TAIL="$HERE/evidence-probe-tail.jsonl"; : > "$TAIL"
"$W" -c "$CFG" tail --format json > "$TAIL" 2>&1 &
TAIL_PID=$!
trap '[ -n "${TAIL_PID:-}" ] && kill "$TAIL_PID" 2>/dev/null; set_version v1' EXIT INT TERM
sleep 8

log "== deploy baseline (marker v1, code incl. terminal-status guard + version guard)"
set_version v1
"$W" -c "$CFG" deploy 2>&1 | tee -a "$LOG" | tail -2
req /init >/dev/null

# delay:prewarm:resend   purpose
MATRIX=${MATRIX:-"5:1:0 5:0:0 5:1:1 5:0:1 2:1:1 2:0:0"}
i=0; RESULTS="[]"
MARKER=1
for spec in $MATRIX; do
  i=$((i+1))
  DELAY=${spec%%:*}; REST=${spec#*:}; PRE=${REST%%:*}; RESEND=${REST##*:}
  U="ut-cf-$RUN-p$i"
  CUR="v$MARKER"; NEXT="v$((MARKER+1))"; MARKER=$((MARKER+1))
  log "== iter $i: task=$U signal ${DELAY}s after deploy (marker $CUR -> $NEXT), prewarm=$PRE resend=$RESEND"

  req /start "{\"taskId\":\"$U\"}" >> "$LOG"
  AW=0
  for _ in $(seq 1 60); do [ "$(tstat "$U")" = awaiting_input ] && { AW=1; break; }; sleep 1; done
  [ "$AW" = 1 ] || log "iter $i: never reached awaiting_input"
  START_V=$(row "$U" | jq -r '[.taskStore.history|fromjson[]|select(.kind=="status" and .step=="wait")|(.payload|fromjson?)|.version][0] // "unknown"')

  set_version "$NEXT"
  DEP_T0=$(now)
  "$W" -c "$CFG" deploy 2>&1 | tee -a "$LOG" | tail -2
  DEP_T1=$(now)
  # how long until the edge serves the new marker (cheap: /version, no steps)
  EDGE_T0=$(now); EDGE_V=""; EDGE_MS=null
  for _ in $(seq 1 40); do
    EDGE_V=$(edge_version)
    [ "$EDGE_V" = "$NEXT" ] && { EDGE_MS=$(( $(now) - EDGE_T0 )); break; }
    sleep 0.5
  done
  log "iter $i: deploy=$((DEP_T1-DEP_T0))ms edge_version=$EDGE_V after=${EDGE_MS}ms"

  # sleep until DELAY seconds have passed since deploy returned
  while [ $(( $(now) - DEP_T1 )) -lt $((DELAY * 1000)) ]; do sleep 0.2; done

  SIG_PAYLOAD="{\"answer\":\"да\",\"expectVersion\":\"$NEXT\"}"
  SIG_T0=$(now)
  req /signal "{\"taskId\":\"$U\",\"prewarm\":$([ "$PRE" = 1 ] && echo true || echo false),\"payload\":$SIG_PAYLOAD}" >> "$LOG"
  SIG_RTT=$(( $(now) - SIG_T0 ))
  RESENT=0
  if [ "$RESEND" = 1 ]; then
    if ! wait_consumed "$U" 10; then
      RESENT=1
      log "iter $i: not consumed 10s after signal -> re-send"
      req /signal "{\"taskId\":\"$U\",\"prewarm\":$([ "$PRE" = 1 ] && echo true || echo false),\"payload\":$SIG_PAYLOAD}" >> "$LOG"
    fi
  fi
  CONSUMED=0
  wait_consumed "$U" 150 && CONSUMED=1
  # let it finish (apply/finalize) unless it is already terminal
  for _ in $(seq 1 45); do case "$(tstat "$U")" in done|failed|cancelled) break;; esac; sleep 2; done
  T_NOW=$(now)
  ST=$(tstat "$U")
  RES=$(row "$U" | jq -c '.taskStore.result_json|fromjson?')
  APPLY_V=$(row "$U" | jq -r '[.taskStore.history|fromjson[]|select(.kind=="step_done" and .step=="apply")|(.payload|fromjson?)|.version][0] // "none"')
  KINDS=$(row "$U" | jq -c '[.taskStore.history|fromjson[]|{kind,step}]')
  SIG_AT=$(hist "$U" signal user_reply); SIG_AT=${SIG_AT:-$SIG_T0}
  END_AT=$(hist "$U" step_done apply); MISMATCH_AT=$(hist "$U" version_mismatch wait)
  END_AT=${END_AT:-${MISMATCH_AT:-0}}
  WAKE_MS=$(( END_AT - SIG_AT ))
  CONSUMED_AT=$(hist "$U" step_done wait)
  if [ -n "$CONSUMED_AT" ]; then CONSUME_MS=$(( CONSUMED_AT - SIG_AT )); else CONSUME_MS=null; fi
  TIMING=$(row "$U" | jq -c '[.taskStore.history|fromjson[]|select(.kind=="signal")|(.payload|fromjson?)|.__timing][0] // null')
  TOTAL_MS=$(( T_NOW - SIG_T0 ))
  log "iter $i: status=$ST consumed=$CONSUMED start_v=$START_V apply_v=$APPLY_V wake=${WAKE_MS}ms consume=${CONSUME_MS}ms re_sent=$RESENT signal_http=${SIG_RTT}ms total=${TOTAL_MS}ms timing=$TIMING result=$RES kinds=$KINDS"
  "$W" -c "$CFG" workflows instances describe task-workflow "$U" > "$HERE/evidence-probe-instance-$i.txt" 2>&1

  R=$(jq -nc --argjson i "$i" --arg task "$U" --argjson delay "$DELAY" --arg prewarm "$PRE" --arg resend "$RESEND" \
      --arg startV "$START_V" --arg nextV "$NEXT" --arg applyV "$APPLY_V" --arg status "$ST" \
      --argjson wake "$WAKE_MS" --argjson edge "$EDGE_MS" --argjson dep "$((DEP_T1-DEP_T0))" \
      --argjson sigRtt "$SIG_RTT" --argjson timing "$TIMING" --argjson consumed "$CONSUMED" \
      --argjson reSent "$RESENT" --argjson consumeMs "$CONSUME_MS" --arg result "$RES" --argjson kinds "$KINDS" \
      '{iter:$i, task:$task, delayAfterDeploySec:$delay, prewarm:($prewarm=="1"), reSent:($resend=="1"),
        markerWaiting:$startV, markerDeployed:$nextV, status:$status, applyVersion:$applyV,
        eventConsumed:($consumed==1), retransmissions:$reSent,
        signalToConsumeMs:$consumeMs,
        wakeMs:$wake, deployMs:$dep, edgePropagationMs:$edge, signalHttpMs:$sigRtt,
        signalTiming:$timing, result:$result, events:$kinds}')
  RESULTS=$(jq --argjson r "$R" '. + [$r]' <<<"$RESULTS")
done

set_version v1
log "== final redeploy v1 (repo state == deployed state)"
"$W" -c "$CFG" deploy 2>&1 | tee -a "$LOG" | tail -2
kill "$TAIL_PID" 2>/dev/null
sleep 3
# Keep only the diagnostic events (run invocations + exceptions + scriptVersion) and drop the
# /status polling noise: the raw tail of this probe is ~4 MB of request headers.
python3 - "$TAIL" "$HERE/evidence-probe-tail-runs.jsonl" <<'PY'
import json, sys
from json import JSONDecoder
src, dst = sys.argv[1], sys.argv[2]
s = open(src, errors="replace").read()
dec, i, out = JSONDecoder(), 0, []
while i < len(s):
    while i < len(s) and s[i] not in "{[":
        i += 1
    if i >= len(s):
        break
    try:
        o, i = dec.raw_decode(s, i)
    except Exception:
        i += 1
        continue
    if not isinstance(o, dict):
        continue
    e = o.get("event")
    if isinstance(e, dict) and (e.get("rpcMethod") or o.get("exceptions")):
        out.append(o)
with open(dst, "w") as f:
    for o in out:
        f.write(json.dumps(o, ensure_ascii=False) + "\n")
print(f"kept {len(out)} diagnostic events -> {dst}", file=sys.stderr)
PY
rm -f "$TAIL"

jq -n --arg run "$RUN" --argjson iterations "$RESULTS" \
  '{variant:"cf-workflows-d1", run:$run, kind:"deploy-during-wait probe (#91 wake latency, #92 code propagation)",
    notes:{ noDeployBaseline:"280-495ms signal->apply (issue #91, 8 observations)",
            diagnosisRun064632:"signal accepted in 171ms (prewarm 13 + send 146) but step_done wait 214.7s later; tail: the blocked run() of the instance was canceled by the runtime at wall=300.4s and re-invoked on the NEW scriptVersion 192ms before the wake -> the wait is in the platform handling of the blocked invocation, not in our request path",
            variants:"prewarm = one RPC into the instance before delivery; retransmission = a second POST /signal 10s later when the event was not consumed (at-least-once delivery)",
            guard:"signal carries expectVersion; old code at wake -> explicit reason=version_mismatch instead of a silent old-code result" },
    iterations:$iterations}' > "$HERE/probe-wake.results.json"

# Slow wakes need up to ~300 s (the platform cancels the instance's blocked run() first), so the
# per-iteration snapshot above can be taken before the instance finished. Re-read every task once
# the dust settles and rewrite the numbers from the final Task Store state.
log "== settle: re-reading every task 120 s after the matrix"
sleep 120
python3 - "$HERE/probe-wake.results.json" "$B" <<'PY'
import json, sys, subprocess, datetime
path, base = sys.argv[1], sys.argv[2]
data = json.load(open(path))
def row(tid):  # curl, not urllib: the edge rejects python-urllib with 403
    out = subprocess.run(["curl", "-s", "-m", "20", f"{base}/status?taskId={tid}"],
                         capture_output=True, text=True).stdout
    return json.loads(out)["taskStore"]
for it in data["iterations"]:
    try:
        ts = row(it["task"])
    except Exception as e:
        print("skip", it["task"], e, file=sys.stderr); continue
    hist = ts["history"]; hist = json.loads(hist) if isinstance(hist, str) else hist
    def at(kind, step=None):
        return [e["at"] for e in hist if e["kind"] == kind and (step is None or e.get("step") == step)]
    it["status"] = ts["status"]
    it["result"] = json.loads(ts["result_json"]) if ts["result_json"] else None
    it["events"] = [{"kind": e["kind"], "step": e.get("step")} for e in hist]
    applies = [json.loads(e["payload"]).get("version") for e in hist
               if e["kind"] == "step_done" and e.get("step") == "apply" and e.get("payload")]
    it["applyVersion"] = applies[0] if applies else "none"
    waits = at("status", "wait")
    sigs = at("signal"); cons = at("step_done", "wait")
    mism = at("version_mismatch", "wait")
    # the guard path consumes the event too (it fails before writing step_done wait)
    it["eventConsumed"] = bool(cons or mism)
    if waits:
        it["waitStartToConsumeMs"] = ((cons or mism)[0] - waits[0]) if (cons or mism) else None
    if sigs:
        it["signalToConsumeMs"] = ((cons or mism)[0] - sigs[0]) if (cons or mism) else None
        end = at("step_done", "apply") or mism or at("step_done", "finalize")
        it["wakeMs"] = (end[0] - sigs[0]) if end else None
    it["settledAt"] = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
data["settled"] = True
json.dump(data, open(path, "w"), ensure_ascii=False, indent=2)
print("settled", file=sys.stderr)
PY
log "== RESULTS: $(jq -c '[.iterations[]|{iter,delayAfterDeploySec,prewarm,reSent,status,applyVersion,eventConsumed,wakeMs,signalToConsumeMs,signalTiming}]' "$HERE/probe-wake.results.json")"
cat "$HERE/probe-wake.results.json"
