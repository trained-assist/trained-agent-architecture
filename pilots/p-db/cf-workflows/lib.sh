# helpers: start/kill wrangler dev, discover the worker socket. Portable: macOS and Linux
# (the earlier version needed setsid+ss, which are Linux-only and made the suite unrunnable
# on a Mac).
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
export PATH=$HERE/bin/bin:$PATH
PROXY_PORT=${PROXY_PORT:-8795}; INSP_PORT=${INSP_PORT:-9295}

tree_pids() { # descendants of $1, $1 included
  local out="$1" stack="$1" next s c
  while [ -n "$stack" ]; do
    next=""
    for s in $stack; do for c in $(pgrep -P "$s" 2>/dev/null); do next="$next $c"; done; done
    out="$out $next"; stack="$next"
  done
  echo "$out"
}
listen_ports() { # listening TCP ports of the process tree of $1
  local pids; pids=$(tree_pids "$1" | tr ' ' ',')
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP -sTCP:LISTEN -a -p "$pids" 2>/dev/null | awk 'NR>1{print $9}' | sed 's/.*://' | sort -u
  else
    for p in $(tree_pids "$1"); do ss -ltnpH 2>/dev/null | grep "pid=$p," | awk '{print $4}' | sed 's/.*://'; done | sort -u
  fi
}
dev_probe() { # $1 = port -> sets BASE on success
  local r; r=$(curl -s -m 2 "http://127.0.0.1:$1/status?taskId=__probe" 2>/dev/null) || return 1
  case "$r" in *taskStore*|*"no such table"*) BASE="http://127.0.0.1:$1"; return 0;; esac
  return 1
}
start_dev() {
  nohup node "$HERE/node_modules/.bin/wrangler" dev --port $PROXY_PORT --inspector-port $INSP_PORT \
    --ip 127.0.0.1 --persist-to "$HERE/state" < /dev/null >> "$HERE/wrangler.log" 2>&1 &
  DEV_PID=$!; echo $DEV_PID > "$HERE/wr.pid"; BASE=""
  local i port
  for i in $(seq 1 90); do
    sleep 0.5
    for port in $PROXY_PORT $(listen_ports "$DEV_PID"); do
      dev_probe "$port" && return 0
    done
  done
  echo "dev did not start" >&2; return 1
}
kill_tree() {
  local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done
  kill -9 "$1" 2>/dev/null
}
kill_dev() {
  local g; g=$(cat "$HERE/wr.pid" 2>/dev/null)
  [ -n "$g" ] && kill_tree "$g"
  # wrangler hands work off to detached helpers (esbuild); sweep anything of OUR install only.
  for p in $(pgrep -f "$HERE/node_modules" 2>/dev/null); do [ "$p" != "$$" ] && kill -9 "$p" 2>/dev/null; done
  sleep 0.5; rm -f "$HERE/wr.pid"
}
pids_csv() { local p; p=$(tree_pids "${1:-}" | xargs 2>/dev/null); [ -n "$p" ] && echo "$p" | tr ' ' ',' || true; }
group_rss_kb() { local c; c=$(pids_csv "$(cat "$HERE/wr.pid" 2>/dev/null)"); [ -n "$c" ] && ps -o rss= -p "$c" 2>/dev/null | awk '{s+=$1} END{print s+0}' || echo 0; }
tree_comm() { local c; c=$(pids_csv "$1"); [ -n "$c" ] && ps -o rss=,comm= -p "$c" 2>/dev/null || true; }
group_procs() { tree_pids "$(cat "$HERE/wr.pid")" | wc -w; }
api() { local m=$1 p=$2 d=${3:-}; if [ "$m" = GET ]; then curl -s -m 15 "$BASE$p"; else curl -s -m 15 -XPOST "$BASE$p" -H 'content-type: application/json' -d "$d"; fi; }
# macOS has no coreutils `timeout`; run unguarded there (the calls below always terminate).
tmo() { if command -v timeout >/dev/null 2>&1; then timeout "$@"; else shift; "$@"; fi; }
