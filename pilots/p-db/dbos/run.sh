#!/usr/bin/env bash
# One command: fresh embedded Postgres -> T1..T8 driver -> stop Postgres, no leftovers.
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || NODE_ENV= npm install --no-audit --no-fund
PGBIN=node_modules/@embedded-postgres/linux-x64/native/bin
PORT=${PILOT_PG_PORT:-$((55432 + RANDOM % 1000))}
DATA=$PWD/pgdata
export PILOT_DB_URL="postgresql://postgres:postgres@127.0.0.1:$PORT/pilot"
cleanup() {
  pkill -9 -f "$PWD/src/executor.ts" 2>/dev/null || true
  "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true
}
trap cleanup EXIT
rm -rf "$DATA"; mkdir -p logs
echo postgres > /tmp/pilot-pgpw.$$
"$PGBIN/initdb" -D "$DATA" -U postgres --pwfile=/tmp/pilot-pgpw.$$ -A scram-sha-256 >/dev/null; rm -f /tmp/pilot-pgpw.$$
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -c unix_socket_directories= -c listen_addresses=127.0.0.1" -l logs/postgres.log -w start >/dev/null
PGPASSWORD=postgres node -e "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.PILOT_DB_URL.replace('/pilot','/postgres')});await c.connect();await c.query('CREATE DATABASE pilot');await c.end()})()"
echo "postgres $("$PGBIN/postgres" --version) on port $PORT, data $DATA"
node --import tsx src/driver.ts 2>&1 | tee logs/driver.log
