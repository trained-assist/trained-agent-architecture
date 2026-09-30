# helpers: start/kill wrangler dev in its own process group, discover the user-worker socket.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
export PATH=$HERE/bin/bin:$PATH
PROXY_PORT=${PROXY_PORT:-8795}; INSP_PORT=${INSP_PORT:-9295}
start_dev() {  # sets PGID and BASE
  setsid nohup node "$HERE/node_modules/.bin/wrangler" dev --port $PROXY_PORT --inspector-port $INSP_PORT \
    --ip 127.0.0.1 --persist-to "$HERE/state" < /dev/null >> "$HERE/wrangler.log" 2>&1 &
  PGID=$!; echo $PGID > "$HERE/wr.pid"; BASE=""
  for i in $(seq 1 60); do
    sleep 0.5
    for pid in $(pgrep -g $PGID workerd); do
      for port in $(ss -ltnpH 2>/dev/null | grep "pid=$pid," | awk '{print $4}' | sed 's/.*://'); do
        [ "$port" = "$PROXY_PORT" ] || [ "$port" = "$INSP_PORT" ] && continue
        if curl -s -m 2 "127.0.0.1:$port/status?taskId=__probe" 2>/dev/null | grep -q taskStore; then BASE="http://127.0.0.1:$port"; return 0; fi
        if curl -s -m 2 "127.0.0.1:$port/status?taskId=__probe" 2>/dev/null | grep -q 'no such table'; then BASE="http://127.0.0.1:$port"; return 0; fi
      done
    done
  done
  echo "dev did not start" >&2; return 1
}
kill_dev() { local g=$(cat "$HERE/wr.pid" 2>/dev/null); [ -n "$g" ] && kill -9 -$g 2>/dev/null; sleep 0.5; rm -f "$HERE/wr.pid"; }
group_rss_kb() { ps -o rss= -g $(cat "$HERE/wr.pid") | awk '{s+=$1} END{print s}'; }
group_procs() { pgrep -g $(cat "$HERE/wr.pid") 2>/dev/null | wc -l; }
api() { local m=$1 p=$2 d=${3:-}; if [ "$m" = GET ]; then curl -s -m 15 "$BASE$p"; else curl -s -m 15 -XPOST "$BASE$p" -H 'content-type: application/json' -d "$d"; fi; }
