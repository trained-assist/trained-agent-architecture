'use strict';
// Pilot driver: manages restate-server + executor processes and runs T1..T8. Writes results.json.
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ClientPort } = require('./port');
const { TaskStore } = require('./taskstore');

const ROOT = path.resolve(__dirname, '..');
const DB = path.join(ROOT, 'taskstore.db');
const ADMIN = 'http://127.0.0.1:19070', INGRESS = 'http://127.0.0.1:18080', SVC_PORT = 19080;
const port = new ClientPort({ ingress: INGRESS, admin: ADMIN });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), '[pilot]', ...a);
const results = { variant: 'restate', restate_server: null, sdk: require('@restatedev/restate-sdk/package.json').version, tests: {}, metrics: {} };

let server = null, svc = null;
const rss = pid => { try { return Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))[1]); } catch { return null; } };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function waitUntil(fn, ms = 20000, what = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(100); }
  throw new Error(`timeout waiting for ${what}`);
}
function startServer() {
  const out = fs.openSync(path.join(ROOT, 'restate-server.log'), 'a');
  server = spawn(path.join(ROOT, 'bin/restate-server'), ['--config-file', path.join(ROOT, 'restate.toml'), '--base-dir', path.join(ROOT, 'restate-data')],
    { stdio: ['ignore', out, out], env: { ...process.env, RESTATE_LOG_FORMAT: 'compact', RESTATE_LOG_DISABLE_ANSI_CODES: 'true' } });
  log(`restate-server pid=${server.pid}`);
  return waitUntil(async () => (await fetch(`${ADMIN}/health`)).ok && (await fetch(`${INGRESS}/restate/health`)).ok, 30000, 'restate health');
}
function startSvc(env = {}) {
  const out = fs.openSync(path.join(ROOT, 'service.log'), 'a');
  svc = spawn(process.execPath, [path.join(__dirname, 'service.js')],
    { stdio: ['ignore', out, out], env: { ...process.env, TASK_DB: DB, SERVICE_PORT: String(SVC_PORT), CRASH_MARKER_DIR: ROOT, ...env } });
  const p = svc;
  svc.exited = new Promise(r => p.on('exit', (code, sig) => r({ code, sig })));
  log(`service pid=${svc.pid} env=${JSON.stringify(env)}`);
  const tcp = () => new Promise(r => { const s = require('net').connect(SVC_PORT, '127.0.0.1', () => { s.end(); r(true); }); s.on('error', () => r(false)); });
  return waitUntil(tcp, 10000, 'service up (h2c port open)');
}
async function kill9(child, name) { if (child && alive(child.pid)) { process.kill(child.pid, 'SIGKILL'); await waitUntil(() => !alive(child.pid) || child.exitCode !== null || child.signalCode, 5000, `${name} dead`); log(`kill -9 ${name} pid=${child.pid}`); } }
async function register() {
  const r = await port._json(`${ADMIN}/deployments`, { method: 'POST', body: JSON.stringify({ uri: `http://127.0.0.1:${SVC_PORT}`, force: true }) });
  log(`register deployment -> ${r.status}`);
  if (r.status >= 300) throw new Error(JSON.stringify(r.body));
}

const store = () => new TaskStore(DB); // fresh handle per read is fine (WAL)
let S;
const taskStatus = id => (S.task(id) || {}).status;
async function start(id, input) {
  S.ensureTask(id); // Task Store row first (source of truth), then engine instance
  const r = await port.start(id, 'pilotPlan', input);
  if (r.body && r.body.invocationId) S.setInstance(id, r.body.invocationId);
  return r;
}
const events = id => S.db.prepare(`SELECT seq,kind,step,generation,payload_json,at FROM task_events WHERE task_id=? ORDER BY seq`).all(id);
const stepsDone = id => events(id).filter(e => e.kind === 'step_done').map(e => e.step);
function record(name, pass, evidence) { results.tests[name] = { result: pass === null ? 'N/A' : pass ? 'PASS' : 'FAIL', evidence }; log(`${name}: ${results.tests[name].result}`, JSON.stringify(evidence)); }

async function main() {
  for (const f of ['taskstore.db', 'taskstore.db-wal', 'taskstore.db-shm', 'restate-server.log', 'service.log']) fs.rmSync(path.join(ROOT, f), { force: true });
  fs.rmSync(path.join(ROOT, 'restate-data'), { recursive: true, force: true });
  for (const f of fs.readdirSync(ROOT)) if (f.startsWith('crash-')) fs.rmSync(path.join(ROOT, f));
  S = store();
  results.restate_server = execSync(`${ROOT}/bin/restate-server --version`).toString().trim();

  let t0 = Date.now();
  await startServer();
  results.metrics.server_cold_start_ms = Date.now() - t0;
  await startSvc({ CRASH_AFTER: 'ut-pilot-2:run' });
  await register();

  // ---------- T1 happy path + idempotent start ----------
  {
    const id = 'ut-pilot-1'; t0 = Date.now();
    const a = await start(id, {}); const b = await start(id, {});
    await waitUntil(() => taskStatus(id) === 'awaiting_input', 20000, 'T1 awaiting');
    const tSig = Date.now();
    const sig = await port.signal(id, 'user_reply', { answer: 'да' });
    await waitUntil(() => taskStatus(id) === 'done', 20000, 'T1 done');
    const wall = Date.now() - t0;
    const applyAt = events(id).find(e => e.step === 'apply').at;
    const out = await port.output(id);
    const steps = stepsDone(id);
    results.metrics.t1_wall_ms = wall; results.metrics.signal_to_step4_ms = applyAt - tSig;
    record('T1', steps.join(',') === 'prepare,run,wait,apply,finalize' && taskStatus(id) === 'done' && a.body.invocationId === b.body.invocationId,
      { start1: a.body, start2_same_key: b.body, signal: sig.body, steps, status: taskStatus(id), counters: S.counters(id), engine_output: out.body, wall_ms: wall, signal_to_apply_ms: applyAt - tSig });
  }

  // ---------- T2 crash (kill -9) right after step 2 ----------
  {
    const id = 'ut-pilot-2';
    await start(id, {});
    const ex = await Promise.race([svc.exited, sleep(15000).then(() => null)]);
    const afterCrash = { exit: ex, counters: S.counters(id), steps: stepsDone(id), status: taskStatus(id) };
    await startSvc({}); // restart executor
    await waitUntil(() => taskStatus(id) === 'awaiting_input', 20000, 'T2 awaiting after restart');
    await port.signal(id, 'user_reply', { answer: 'да' });
    await waitUntil(() => taskStatus(id) === 'done', 20000, 'T2 done');
    const c = S.counters(id);
    record('T2', ex && ex.sig === 'SIGKILL' && afterCrash.counters.run === 1 && c.prepare === 1 && c.run === 1 && c.apply === 1 && taskStatus(id) === 'done',
      { afterCrash, afterRestart: { counters: c, steps: stepsDone(id), status: taskStatus(id), attempts: events(id).filter(e => e.kind === 'attempt_claimed').map(e => ({ gen: e.generation, owner: JSON.parse(e.payload_json).owner })) } });
  }

  // ---------- T3 wait with no executor; also kill restate-server during the wait ----------
  {
    const id = 'ut-pilot-3';
    await start(id, {});
    await waitUntil(() => taskStatus(id) === 'awaiting_input', 20000, 'T3 awaiting');
    const engSusp = await waitUntil(async () => { const s = await port.status(id); return s && s.status === 'suspended' ? s : null; }, 10000, 'T3 suspended');
    const m = { server_rss_kb_waiting: rss(server.pid), service_rss_kb_waiting_idle: rss(svc.pid), engine_status_while_waiting: engSusp.status };
    await kill9(svc, 'service'); svc = null;
    m.executor_alive_during_wait = false;
    await kill9(server, 'restate-server');
    await sleep(500);
    await startServer(); // restart engine while task is waiting, still no executor
    m.engine_status_after_server_restart = (await port.status(id)).status;
    m.server_rss_kb_after_restart_waiting = rss(server.pid);
    const tSig = Date.now();
    const sig = await port.signal(id, 'user_reply', { answer: 'да' }, { async: true }); // executor still down: accepted durably by engine
    await sleep(1500);
    m.status_1500ms_after_signal_executor_down = taskStatus(id);
    await startSvc({});
    await waitUntil(() => taskStatus(id) === 'done', 30000, 'T3 done');
    m.signal_to_done_ms_incl_executor_boot = Date.now() - tSig;
    const c = S.counters(id);
    Object.assign(results.metrics, { server_rss_kb_waiting: m.server_rss_kb_waiting, service_rss_kb_idle: m.service_rss_kb_waiting_idle });
    record('T3', engSusp.status === 'suspended' && m.status_1500ms_after_signal_executor_down === 'awaiting_input' && taskStatus(id) === 'done' && c.apply === 1 && c.prepare === 1 && c.run === 1,
      { ...m, signal_send: sig.body, counters: c, status: taskStatus(id) });
  }

  // ---------- T4 early signal (before waitFor reached) ----------
  {
    const id = 'ut-pilot-4';
    await start(id, { runDelayMs: 3000 });
    await waitUntil(() => stepsDone(id).includes('prepare'), 10000, 'T4 prepare');
    const sig = await port.signal(id, 'user_reply', { answer: 'да' });
    const tSig = Date.now();
    const stepsAtSignal = stepsDone(id);
    await waitUntil(() => taskStatus(id) === 'done', 20000, 'T4 done');
    const waitAt = events(id).find(e => e.step === 'wait').at;
    record('T4', !stepsAtSignal.includes('wait') && waitAt > tSig && S.counters(id).apply === 1 && taskStatus(id) === 'done',
      { signal: sig.body, steps_when_signal_sent: stepsAtSignal, wait_step_reached_ms_after_signal: waitAt - tSig, counters: S.counters(id), status: taskStatus(id) });
  }

  // ---------- T5 duplicate signal ----------
  {
    const id = 'ut-pilot-5';
    await start(id, {});
    await waitUntil(() => taskStatus(id) === 'awaiting_input', 20000, 'T5 awaiting');
    const [s1, s2] = await Promise.all([port.signal(id, 'user_reply', { answer: 'да' }), port.signal(id, 'user_reply', { answer: 'да' })]);
    await waitUntil(() => taskStatus(id) === 'done', 20000, 'T5 done');
    const s3 = await port.signal(id, 'user_reply', { answer: 'нет' }); // after completion
    await sleep(500);
    const c = S.counters(id);
    record('T5', c.apply === 1 && [s1, s2].filter(s => s.body.accepted).length === 1 && taskStatus(id) === 'done',
      { signal1: s1.body, signal2_concurrent: s2.body, signal3_after_done: s3.body, counters: c, result: S.task(id).result_json });
  }

  // ---------- T6 fencing: stale generation write ----------
  {
    const id = 'ut-pilot-2'; // its first attempt (gen 1, pid killed in T2) is a real stale executor identity
    const before = { task: S.task(id), counters: S.counters(id) };
    const staleGen = events(id).find(e => e.kind === 'attempt_claimed').generation;
    const r = S.commitStep(id, staleGen, 'apply', { sideEffect: 'apply', status: 'running', result: { answer: 'STALE' } });
    if (!r.ok) S.recordRejected(id, staleGen, 'apply', r.reason);
    // live-task variant: a task waiting for input, a zombie of the previous attempt writes after resume bumped gen
    const id2 = 'ut-pilot-6';
    await start(id2, {});
    await waitUntil(() => taskStatus(id2) === 'awaiting_input', 20000, 'T6 awaiting');
    await waitUntil(async () => { const s = await port.status(id2); return s && s.status === 'suspended'; }, 10000, 'T6 suspended');
    const g1 = S.task(id2).generation; // attempt that ran steps 1-3 and then suspended
    await port.signal(id2, 'user_reply', { answer: 'да' });
    await waitUntil(() => taskStatus(id2) === 'done', 20000, 'T6 done');
    const g2 = S.task(id2).generation;
    const r2 = S.commitStep(id2, g1, 'finalize', { status: 'failed', result: { zombie: true } });
    if (!r2.ok) S.recordRejected(id2, g1, 'finalize', r2.reason);
    const after = { task: S.task(id), counters: S.counters(id) };
    record('T6', !r.ok && !r2.ok && g2 > g1 && /stale generation/.test(r2.reason) && JSON.stringify(before) === JSON.stringify(after) && taskStatus(id2) === 'done',
      { stale_write_ut2: { staleGen, currentGen: before.task.generation, verdict: r }, state_unchanged: JSON.stringify(before) === JSON.stringify(after),
        zombie_write_ut6: { gen_before_resume: g1, gen_after_resume: g2, verdict: r2, status: taskStatus(id2) } });
  }

  // ---------- T7 cancel during wait ----------
  {
    const id = 'ut-pilot-7';
    const st = await start(id, {});
    await waitUntil(() => taskStatus(id) === 'awaiting_input', 20000, 'T7 awaiting');
    const inv = st.body.invocationId;
    const c = await port.cancel(inv);
    await waitUntil(() => taskStatus(id) === 'cancelled', 20000, 'T7 cancelled');
    const sig = await port.signal(id, 'user_reply', { answer: 'да' });
    await kill9(svc, 'service'); await startSvc({});
    const restart = await start(id, {}); // same key after cancel
    await sleep(2000);
    const eng = await port.status(id);
    const cn = S.counters(id);
    record('T7', taskStatus(id) === 'cancelled' && cn.apply === 0 && !stepsDone(id).includes('apply'),
      { cancel_http: c.status, signal_after_cancel: sig.body, start_again_same_key: restart.body, engine: eng, counters: cn, status: taskStatus(id), steps: stepsDone(id) });
  }

  // ---------- T8 observability ----------
  {
    const row = S.observe('ut-pilot-2');
    record('T8', !!row && row.status === 'done' && JSON.parse(row.history).length > 5, { sql: TaskStore.OBS_SQL.replace(/\s+/g, ' '), row });
  }

  results.metrics.restate_data_kb = Number(execSync(`du -sk ${ROOT}/restate-data`).toString().split('\t')[0]);
  results.metrics.taskstore_kb = Number(execSync(`du -sk ${DB}`).toString().split('\t')[0]);
  results.metrics.server_rss_kb_end = rss(server.pid);
  results.metrics.service_rss_kb_end = rss(svc.pid);
  results.metrics.adapter_loc = Object.fromEntries(['port.js', 'taskstore.js', 'service.js'].map(f => [f, fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length]));
  results.metrics.moving_parts = ['restate-server (single binary, embeds RocksDB + log + metadata)', 'executor node process (SDK endpoint)', 'Task Store SQLite file'];
}

main().then(() => 0, e => { console.error('PILOT ERROR', e); results.error = String(e.stack || e); return 1; })
  .then(async code => {
    await kill9(svc, 'service'); await kill9(server, 'restate-server');
    const pass = Object.values(results.tests).filter(t => t.result === 'PASS').length;
    results.summary = `${pass}/${Object.keys(results.tests).length} PASS`;
    fs.writeFileSync(path.join(ROOT, 'results.json'), JSON.stringify(results, null, 2));
    log('SUMMARY', results.summary, JSON.stringify(results.metrics));
    process.exit(code);
  });
