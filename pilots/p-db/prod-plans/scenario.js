'use strict';
// Orchestrator: plays the "user/MCP process" role (start/signal/cancel via the
// Port) and spawns / kill -9's executor.js children. Writes results.json.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const port = require('./port');
const { DEFINITION, counters, sideEffectAt } = require('./steps');

const DIR = __dirname;
const LOGS = path.join(process.env.AGENT_DATA_DIR, '..', 'logs');
fs.mkdirSync(LOGS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();
const out = { variant: 'prod-plans', source: (() => { try { return 'trained-assist-agent origin/main ' + fs.readFileSync(path.join(__dirname, 'vendor', 'COMMIT'), 'utf8').trim(); } catch { return null; } })(), config: {}, tests: {}, metrics: {}, evidence: {} };
const children = new Set();

function spawnExec(tag, env = {}) {
  const logFile = path.join(LOGS, `exec-${tag}.log`);
  const fd = fs.openSync(logFile, 'w');
  const c = spawn(process.execPath, [path.join(DIR, 'executor.js')], { env: { ...process.env, ...env }, stdio: ['ignore', fd, fd] });
  c.tag = tag; c.logFile = logFile; c.exited = new Promise(r => c.on('exit', (code, sig) => { children.delete(c); r({ code, sig }); }));
  children.add(c);
  return c;
}
const logOf = c => fs.readFileSync(c.logFile, 'utf8');
async function until(cond, ms = 20000, step = 10) {
  const t0 = now();
  for (;;) { const v = await cond(); if (v) return v; if (now() - t0 > ms) throw new Error('timeout waiting: ' + cond.toString().slice(0, 120)); await sleep(step); }
}
async function kill9(c) { process.kill(c.pid, 'SIGKILL'); return c.exited; }
const rss = pid => { try { return Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))[1]); } catch { return null; } };
const liveExecutors = () => { try { return execFileSync('pgrep', ['-f', path.join(DIR, 'executor.js')]).toString().trim().split('\n').filter(Boolean); } catch { return []; } };
const { store } = port.mods();
const item = (id, title) => store.db.prepare('SELECT * FROM task_items WHERE task_id = ? AND title = ?').get(id, title);
const execsOf = (id, title) => store.db.prepare(`SELECT e.id, e.status, e.attempt_number FROM executions e JOIN task_items i ON i.id = e.task_item_id
  WHERE e.task_id = ? AND i.title = ? ORDER BY e.started_at`).all(id, title);
const parked = id => { const it = item(id, 'wait'); if (!it || it.status !== 'waiting' || !it.wait_json) return false; return !JSON.parse(it.wait_json).resolved; };
const taskStatus = id => store.getTask(id, port.PROFILE).status;
const verdict = (ok) => ok ? 'PASS' : 'FAIL';

const FAST = { PILOT_FULL_TICK_FIRST_MS: '500', PILOT_FULL_TICK_MS: '2000' };
// T1 runs with PROD cadence (5-min tick; progress by the 3-s post-settle kick; 30-s wait tick)
const PRODLIKE = { PILOT_FULL_TICK_FIRST_MS: '500', PILOT_FULL_TICK_MS: '300000' };

(async () => {
  out.config = { DURABLE_KICK_DEBOUNCE_MS: process.env.DURABLE_KICK_DEBOUNCE_MS || '3000 (prod default)', DURABLE_WAIT_TICK_MS: process.env.DURABLE_WAIT_TICK_MS || '30000 (prod default)', fast: FAST, prodlike: PRODLIKE };

  // ── T1 happy path ───────────────────────────────────────────────────────
  {
    const ID = 'ut-pilot-1';
    const t0 = now();
    await port.start(ID, DEFINITION, { n: 1 });
    const again = await port.start(ID, DEFINITION, { n: 1 }); // idempotent start
    const e = spawnExec('t1', PRODLIKE);
    await until(() => parked(ID), 30000);
    const rssKb = rss(e.pid);
    await sleep(1000);
    const tSig = now();
    const sig = await port.signal(ID, 'user_reply', { answer: 'да' });
    await until(() => taskStatus(ID) === 'done', 30000);
    const tDone = now();
    const st = port.status(ID);
    const c = counters(ID);
    const lat = sideEffectAt(ID, 'apply') - tSig;
    out.metrics.t1_wall_ms_total = tDone - t0;
    out.metrics.t1_wall_ms_excluding_1s_pause = tDone - t0 - 1000;
    out.metrics.signal_to_step4_ms_live_executor = lat;
    out.metrics.executor_rss_kb_while_waiting = rssKb;
    const ok = st.status === 'done' && st.items.length === 5 && st.items.every(i => i.status === 'done') && Object.values(c).every(n => n === 1);
    out.tests.T1 = { verdict: verdict(ok), status: st.status, steps: st.items.map(i => `${i.step}:${i.status}`), counters: c, idempotentStart: again, signalReply: sig.error || 'ok', kickSeen: /KICK via http/.test(logOf(e)) };
    await kill9(e);
  }

  // ── Owner lock: a second executor on the same data dir is refused ────────
  {
    const a = spawnExec('lockA', FAST);
    await until(() => /BOOT/.test(logOf(a)));
    const b = spawnExec('lockB', FAST);
    const r = await b.exited;
    out.evidence.ownerLock = { secondExecutor: r, log: logOf(b).trim().split('\n').pop() };
    await kill9(a);
  }

  // ── T2 crash after step 2, T3 wait with no process, T5 duplicate signal ─
  {
    const ID = 'ut-pilot-2';
    await port.start(ID, DEFINITION, { n: 2 });
    const e1 = spawnExec('t2-a', FAST);
    await until(() => item(ID, 'run').status === 'done', 20000, 2);
    await kill9(e1); // kill -9 right after step 2 settled
    const atKill = { wait: { status: item(ID, 'wait').status, attempts: item(ID, 'wait').attempt_count, executions: execsOf(ID, 'wait').length }, counters: counters(ID) };
    const e2 = spawnExec('t2-b', FAST);
    await until(() => parked(ID), 20000);
    const bootLine = (logOf(e2).match(/BOOT .*/) || [''])[0];
    const c2 = counters(ID);
    out.tests.T2 = { verdict: verdict(atKill.wait.executions === 0 && c2.prepare === 1 && c2.run === 1), atKill, afterRestart: { counters: c2, wait: 'parked', boot: bootLine },
      note: 'step 3 had not started at kill (0 executions); after restart the positional claim resumes at step 3' };

    // T3: executor fully stopped while waiting
    await kill9(e2);
    const alive = liveExecutors();
    const tStatus = { task: taskStatus(ID), wait: item(ID, 'wait').status, wait_json: JSON.parse(item(ID, 'wait').wait_json) };
    await sleep(1500);
    // T5: duplicate signal while nobody runs
    const tSig = now();
    const s1 = await port.signal(ID, 'user_reply', { answer: 'да' });
    const s2 = await port.signal(ID, 'user_reply', { answer: 'да' });
    const e3 = spawnExec('t3-restart', FAST);
    await until(() => taskStatus(ID) === 'done', 30000);
    const c3 = counters(ID);
    const s3 = await port.signal(ID, 'user_reply', { answer: 'да' });
    out.metrics.signal_to_step4_ms_executor_down_then_restarted = sideEffectAt(ID, 'apply') - tSig;
    out.tests.T3 = { verdict: verdict(alive.length === 0 && taskStatus(ID) === 'done'), liveExecutorsWhileWaiting: alive.length, storeWhileWaiting: { task_status: tStatus.task, item_status: tStatus.wait, awaiting_user: tStatus.wait_json.awaiting_user, deadline_at: new Date(tStatus.wait_json.deadline_at).toISOString() }, final: taskStatus(ID) };
    out.tests.T5 = { verdict: verdict(c3.apply === 1 && !s1.error && !s2.error), counters: c3, signal1: s1.error || 'accepted', signal2: s2.error || 'accepted (overwrites woken_at/wake_message, last-writer-wins)', signalAfterDone: s3.error || 'accepted', waitExecutions: execsOf(ID, 'wait') };
    await kill9(e3);
  }

  // ── T2b (extra): kill -9 INSIDE step 2 after its side effect ─────────────
  {
    const ID = 'ut-pilot-2b';
    await port.start(ID, DEFINITION, { n: '2b' });
    const e1 = spawnExec('t2b-a', { ...FAST, HANG_IN_STEP: 'run' });
    await until(() => /CHECKPOINT in-step run/.test(logOf(e1)), 20000, 5);
    await kill9(e1);
    const e2 = spawnExec('t2b-b', FAST);
    await until(() => parked(ID), 20000);
    out.evidence.T2b_kill_inside_step = { boot: (logOf(e2).match(/BOOT .*/) || [''])[0], counters: counters(ID), runExecutions: execsOf(ID, 'run'),
      note: 'at-least-once: a step killed between its side effect and settle is re-executed (no idempotency key / step-result memo before settle)' };
    await port.signal(ID, 'user_reply', { answer: 'да' });
    await until(() => taskStatus(ID) === 'done', 30000);

    // ── T4 early signal (same live executor e2) ─────────────────────────────
    const ID4 = 'ut-pilot-4';
    await port.start(ID4, DEFINITION, { n: 4 });
    const early = await port.signal(ID4, 'user_reply', { answer: 'да' });
    await until(() => parked(ID4), 20000);
    await sleep(3000);
    const lost = { stillParked: parked(ID4), apply: counters(ID4).apply, wake_message: JSON.parse(item(ID4, 'wait').wait_json).wake_message ?? null };
    const retry = await port.signal(ID4, 'user_reply', { answer: 'да' }); // sender must retry
    await until(() => taskStatus(ID4) === 'done', 30000);
    out.tests.T4 = { verdict: verdict(!early.error && !lost.stillParked), earlySignal: early.error || 'accepted', afterReachingWait: lost, senderRetry: retry.error || 'accepted', finalAfterRetry: taskStatus(ID4) };

    // ── T7 cancel while waiting ─────────────────────────────────────────────
    const ID7 = 'ut-pilot-7';
    await port.start(ID7, DEFINITION, { n: 7 });
    await until(() => parked(ID7), 20000);
    const execBefore = store.db.prepare('SELECT COUNT(*) n FROM executions WHERE task_id = ?').get(ID7).n;
    const can = await port.cancel(ID7);
    const sig = await port.signal(ID7, 'user_reply', { answer: 'да' });
    await kill9(e2);
    const e3 = spawnExec('t7-restart', FAST);
    await until(() => /BOOT/.test(logOf(e3)));
    await sleep(5000); // >= 2 full ticks
    const execAfter = store.db.prepare('SELECT COUNT(*) n FROM executions WHERE task_id = ?').get(ID7).n;
    const c7 = counters(ID7);
    out.tests.T7 = { verdict: verdict(taskStatus(ID7) === 'cancelled' && c7.apply === 0 && execAfter === execBefore), cancel: can.task && can.task.status, signalAfterCancel: sig.error || 'accepted by wakeItem (item still waiting)', counters: c7, executionsBefore: execBefore, executionsAfter: execAfter, waitItem: item(ID7, 'wait').status };
    await kill9(e3);
  }

  // ── T6 fencing (in-process, see t6-fencing.js) ────────────────────────────
  {
    const t6out = execFileSync(process.execPath, [path.join(DIR, 't6-fencing.js')], { env: process.env }).toString();
    out.evidence.t6_log = t6out.split('\n').filter(l => !l.startsWith('T6JSON'));
    const r = JSON.parse(t6out.split('\n').find(l => l.startsWith('T6JSON')).slice(7));
    out.tests.T6 = { verdict: r.staleAccepted ? 'FAIL' : 'PASS', ...r };
  }

  // ── T8 one SQL query ─────────────────────────────────────────────────────
  {
    const SQL = `SELECT t.id, t.status, t.revision,
  (SELECT json_group_array(json_object('pos', position, 'step', title, 'status', status, 'attempts', attempt_count, 'wait', json_extract(wait_json, '$.resolved')))
     FROM (SELECT * FROM task_items WHERE task_id = t.id ORDER BY position)) AS steps,
  (SELECT json_group_array(json_object('exec', eid, 'step', title, 'status', estatus, 'attempt', attempt_number, 'at', started_at))
     FROM (SELECT e.id eid, i.title, e.status estatus, e.attempt_number, e.started_at FROM executions e JOIN task_items i ON i.id = e.task_item_id
           WHERE e.task_id = t.id ORDER BY e.started_at, e.rowid)) AS history
FROM durable_tasks t WHERE t.id = ?`;
    const row = store.db.prepare(SQL).get('ut-pilot-2');
    row.steps = JSON.parse(row.steps); row.history = JSON.parse(row.history);
    out.tests.T8 = { verdict: row.status === 'done' && row.steps.length === 5 ? 'PASS' : 'FAIL', sql: SQL, params: ['ut-pilot-2'], row };
  }

  out.metrics.live_executors_at_end = liveExecutors().length;
  out.metrics.adapter_loc = { 'port.js': 64, 'steps.js runtime': 65, 'executor.js': 34, note: 'non-blank non-comment; prod modules reused unchanged' };
  out.gaps = ['step = LLM run + DURABLE: text marker, no deterministic step fn / structured result',
    'no step-result memo or idempotency key: kill between side effect and settle re-executes (T2b run=2)',
    'no owner/lease/generation on attempts: stale settle accepted (T6); only host-level execution-owner.sqlite lock',
    'no signal inbox / event type / dedup: early signal rejected and lost (T4); duplicate wake overwrites',
    'no awaiting_input task status; no append-only event table',
    'cancel via task_update leaves item waiting and wakeable',
    'restart latency: first wait tick 30s / full tick 2min after boot'];
  fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out.tests).map(([k, v]) => [k, v.verdict]))));
  console.log(JSON.stringify(out.metrics));
  process.exit(0);
})().catch(e => { console.error('SCENARIO ERROR', e); for (const c of children) try { process.kill(c.pid, 'SIGKILL'); } catch {} process.exit(1); });
