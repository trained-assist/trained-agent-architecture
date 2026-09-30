'use strict';
// The "executor" process: the durable part of prod src/server.js, and nothing else.
//   1. acquireExecutionOwner(SYSTEM_ROOT)          — server.js line 2 (single-owner lock)
//   2. reconcileOrphanedRunning({graceMs: 0})      — resumePendingTasks boot sweep
//   3. _setKickDeps + useInProcess + /internal/durable/kick — scheduleGtdController
//   4. full durable pass (5-min GTD tick; first one 2 min after boot in prod)
//   5. runWaitTick every DURABLE_WAIT_TICK_MS (30 s in prod)
// runTask (the LLM agent run) is replaced by the deterministic runtime in steps.js.
const http = require('http');
const path = require('path');
const { mods, VSRC } = require('./port');
const { runTask } = require('./steps');

const FULL_TICK_FIRST_MS = Number(process.env.PILOT_FULL_TICK_FIRST_MS || 120000); // prod: 2 min
const FULL_TICK_MS = Number(process.env.PILOT_FULL_TICK_MS || 300000);             // prod: 5 min
const WAIT_TICK_MS = Number(process.env.DURABLE_WAIT_TICK_MS || 30000);            // prod: 30 s

const log = (...a) => console.log(new Date().toISOString(), ...a);

const { SYSTEM_ROOT } = require(path.join(VSRC, 'data-paths.js'));
let owner;
try { owner = require(path.join(VSRC, 'execution-owner-lock.js')).acquireExecutionOwner(SYSTEM_ROOT); }
catch (e) { log('OWNER_LOCK_REFUSED', e.code, e.message); process.exit(3); }

const { G } = mods();
const n = G.reconcileOrphanedRunning(undefined, { graceMs: 0, exceptItemIds: new Set() });
log(`BOOT pid=${process.pid} requeued=${n}`);

const deps = { secrets: {}, runTask, isTaskRunning: () => false, freeSlots: () => 4 };
G._setKickDeps(deps);
require(path.join(VSRC, 'durable-kick.js')).useInProcess(() => G.kickDurable());

const srv = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/internal/durable/kick'
      && req.headers.authorization === `Bearer ${process.env.AGENT_SECRET}`) {
    G.kickDurable(); log('KICK via http'); res.writeHead(200); return res.end('{"ok":true}');
  }
  res.writeHead(404); res.end();
});
srv.listen(Number(process.env.PORT), '127.0.0.1', () => log(`LISTEN ${process.env.PORT}`));

const full = () => G.runDueDurable({ ...deps, now: Date.now(), maxFires: 4 })
  .then(f => f && log(`TICK full fired=${f}`)).catch(e => log('tick error', e.message));
const waitTick = () => G.runWaitTick({ ...deps, now: Date.now() })
  .then(f => f && log(`TICK wait fired=${f}`)).catch(e => log('wait tick error', e.message));
setTimeout(full, FULL_TICK_FIRST_MS); setInterval(full, FULL_TICK_MS);
setTimeout(waitTick, Math.min(WAIT_TICK_MS, 30000)); setInterval(waitTick, WAIT_TICK_MS);
process.on('SIGTERM', () => { owner.close(); process.exit(0); });
