#!/usr/bin/env bash
# One command: download restate-server (if missing), install deps, run T1..T8, clean up processes.
set -euo pipefail
cd "$(dirname "$0")"
VER=v1.7.12
cleanup() {
  pkill -9 -f "$PWD/bin/restate-server" 2>/dev/null || true
  pkill -9 -f "$PWD/src/service.js" 2>/dev/null || true
}
trap cleanup EXIT
cleanup
for p in 18080 19070 15122 19080; do
  if ss -ltn | grep -q ":$p "; then echo "port $p busy" >&2; exit 1; fi
done
if [ ! -x bin/restate-server ]; then
  mkdir -p bin
  curl -sfL "https://github.com/restatedev/restate/releases/download/$VER/restate-server-x86_64-unknown-linux-musl.tar.xz" | tar xJ -C bin --strip-components=1
fi
[ -d node_modules ] || NODE_ENV= npm install --no-audit --no-fund
node src/pilot.js 2>&1 | tee pilot.log
