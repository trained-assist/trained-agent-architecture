#!/usr/bin/env bash
# One command: vendor prod code (read-only from origin/main), run T1–T8, clean up.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PROD_REPO="${PROD_REPO:-/home/vova/trained-assist-agent}"
cd "$DIR"

cleanup() { pkill -9 -f "$DIR/executor.js" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

if [ ! -f vendor/src/durable-task-store.js ] || [ "${REVENDOR:-0}" = 1 ]; then
  rm -rf vendor && mkdir -p vendor
  git -C "$PROD_REPO" archive origin/main src contracts infra/env-manifest.json package.json | tar -x -C vendor
  (cd vendor && echo '{"name":"vendor-deps","private":true}' > deps.json && mkdir -p _d && cp deps.json _d/package.json \
    && cd _d && NODE_ENV= npm install --no-audit --no-fund better-sqlite3@11 ajv@8 croner@10 >/dev/null && mv node_modules ../ && cd .. && rm -rf _d deps.json)
fi
git -C "$PROD_REPO" rev-parse --short origin/main > vendor/COMMIT 2>/dev/null || true

# Sandbox: every store path inside this folder. Never the real HOME / state.db.
rm -rf sandbox && mkdir -p sandbox/{home,data,users,tokens,logs}
export HOME="$DIR/sandbox/home" AGENT_DATA_DIR="$DIR/sandbox/data" USERS_DIR="$DIR/sandbox/users"
export AGENT_TOKENS_DIR="$DIR/sandbox/tokens" AGENT_TOKENS_ROOT="$DIR/sandbox/tokens"
export AGENT_SECRET="pilot-secret" PORT="${PILOT_PORT:-39417}" NODE_ENV=test
unset AGENT_RUN_TOKEN TELEGRAM_BOT_TOKEN BOT_TOKEN || true

node scenario.js 2>&1 | tee sandbox/logs/scenario.log
echo "live executors after run: $(pgrep -f "$DIR/executor.js" | wc -l)"
