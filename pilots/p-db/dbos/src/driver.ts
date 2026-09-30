// Test driver for T1..T8. Spawns/kills executor processes, uses the Port from outside.
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { makePool, migrate, counters, fencedStep, StaleGenerationError } from './taskstore';
import { WorkflowPort } from './port';

const ROOT = path.resolve(__dirname, '..');
const pool = makePool();
const results: any = { variant: 'dbos', engine: '', postgres: '', tests: {}, metrics: {} };
const log = (...a: unknown[]) => console.log(new Date().toISOString(), '[driver]', ...a);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function kb(pid: number, field: string, file = 'status') {
  try { const m = fs.readFileSync(`/proc/${pid}/${file}`, 'utf8').match(new RegExp(`${field}:\\s+(\\d+)`)); return m ? +m[1] : 0; }
  catch { return 0; }
}
function pgPids(): number[] {
  const master = +fs.readFileSync(path.join(ROOT, 'pgdata/postmaster.pid'), 'utf8').split('\n')[0];
  const kids = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d)).map(Number).filter(p => {
    try { return +fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' ')[1] === master; } catch { return false; }
  });
  return [master, ...kids];
}
function pgMem() {
  const pids = pgPids();
  return { processes: pids.length, rss_kb_sum: pids.reduce((s, p) => s + kb(p, 'VmRSS'), 0),
           pss_kb_sum: pids.reduce((s, p) => s + kb(p, 'Pss', 'smaps_rollup'), 0) };
}
function executorPids(): number[] {
  return fs.readdirSync('/proc').filter(d => /^\d+$/.test(d)).map(Number).filter(p => {
    try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').includes(path.join(ROOT, 'src/executor.ts')); } catch { return false; }
  });
}

let execN = 0;
function startExecutor(env: Record<string, string> = {}): Promise<ChildProcess> {
  const name = `exec-${++execN}`;
  const out = fs.createWriteStream(path.join(ROOT, `logs/${name}.log`));
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, 'src/executor.ts')],
    { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    const onData = (d: Buffer) => {
      const s = d.toString(); out.write(s);
      for (const line of s.split('\n').filter(Boolean)) console.log(`   ${name}| ${line}`);
      if (s.includes('READY')) resolve(child);
    };
    child.stdout!.on('data', onData); child.stderr!.on('data', onData);
    child.on('exit', (code, sig) => { log(`${name} pid ${child.pid} exited code=${code} signal=${sig}`); reject(new Error('exited before ready')); });
  });
}
async function kill9(c: ChildProcess) {
  if (c.exitCode !== null || c.signalCode !== null) return;
  const done = new Promise(r => c.once('exit', r));
  process.kill(c.pid!, 'SIGKILL'); await done;
}
async function waitUntil(what: string, fn: () => Promise<boolean>, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { if (await fn()) return Date.now() - t0; await sleep(50); }
  throw new Error(`timeout waiting for ${what}`);
}
const taskStatus = async (id: string) => (await pool.query(`SELECT status FROM tasks WHERE id=$1`, [id])).rows[0]?.status;
const history = async (id: string) => (await pool.query(
  `SELECT id, generation, kind, step, payload, to_char(created_at,'HH24:MI:SS.MS') at FROM task_events WHERE task_id=$1 ORDER BY id`, [id])).rows;
const stepsDone = async (id: string) => (await pool.query(
  `SELECT step FROM task_events WHERE task_id=$1 AND kind='step_done' ORDER BY id`, [id])).rows.map(r => r.step);
function record(t: string, pass: boolean | null, evidence: any) {
  results.tests[t] = { result: pass === null ? 'N/A' : pass ? 'PASS' : 'FAIL', evidence };
  log(`${t}: ${results.tests[t].result}`, JSON.stringify(evidence));
}

async function main() {
  await migrate(pool);
  results.postgres = (await pool.query('SELECT version()')).rows[0].version;
  results.engine = '@dbos-inc/dbos-sdk ' + JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/@dbos-inc/dbos-sdk/package.json'), 'utf8')).version;
  let ex = await startExecutor();              // first launch creates the dbos system schema
  const port = await WorkflowPort.open(pool);

  // ---------------- T1 happy path + idempotent start ----------------
  const t1 = 'ut-pilot-1'; const T1start = Date.now();
  await port.start(t1, { plan: 'pilot' });
  await waitUntil('t1 awaiting', async () => (await taskStatus(t1)) === 'awaiting_input');
  const sigAt = Date.now();
  await port.signal(t1, 'user_reply', { answer: 'да' }, 'reply-1');
  const lat = await waitUntil('t1 apply', async () => (await stepsDone(t1)).includes('apply'));
  await waitUntil('t1 done', async () => (await taskStatus(t1)) === 'done');
  const T1ms = Date.now() - T1start;
  const again = await port.start(t1, { plan: 'pilot' });   // idempotent start
  await sleep(1500);
  const st1 = await port.status(t1); const c1 = await counters(pool, t1); const s1 = await stepsDone(t1);
  const latDb = (await pool.query(`SELECT extract(epoch FROM (a.created_at - s.created_at))*1000 ms FROM task_events a, task_events s
     WHERE a.task_id=$1 AND s.task_id=$1 AND a.step='apply' AND a.kind='step_done' AND s.kind='signal'`, [t1])).rows[0].ms;
  results.metrics.t1_wall_ms = T1ms; results.metrics.signal_to_step4_ms_db = Math.round(latDb); results.metrics.signal_to_step4_ms_poll = lat;
  record('T1', st1.task.status === 'done' && st1.engine === 'SUCCESS' && s1.length === 5 && c1.prepare === 1 && c1.run === 1 && c1.apply === 1 && again === t1,
    { status: st1, steps: s1, counters: c1, second_start_returned: again, t1_wall_ms: T1ms, signal_to_step4_ms: Math.round(latDb) });

  // ---------------- T4 early signal (before waitFor; executor down) ----------------
  await kill9(ex);
  const t4 = 'ut-pilot-4';
  await port.start(t4, {});                                  // ENQUEUED, nobody runs it
  await port.signal(t4, 'user_reply', { answer: 'да' }, 'reply-4');
  const before4 = { task: await taskStatus(t4), engine: (await port.status(t4)).engine };
  let sendToUnknown: string;
  try { await port.raw.send('ut-pilot-nonexistent', { answer: 'да' }, 'user_reply'); sendToUnknown = 'accepted'; }
  catch (e: any) { sendToUnknown = `rejected: ${e.constructor.name}: ${String(e.message).slice(0, 160)}`; }
  ex = await startExecutor();
  await waitUntil('t4 done', async () => (await taskStatus(t4)) === 'done');
  const c4 = await counters(pool, t4);
  const signalBeforeWait = (await pool.query(`SELECT (SELECT min(id) FROM task_events WHERE task_id=$1 AND kind='signal') <
     (SELECT min(id) FROM task_events WHERE task_id=$1 AND step='wait') AS ok`, [t4])).rows[0].ok;
  record('T4', c4.apply === 1 && signalBeforeWait, { state_when_signalled: before4, signal_event_before_wait_step: signalBeforeWait,
    counters: c4, final: await port.status(t4), send_to_nonexistent_workflow: sendToUnknown });

  // ---------------- T2 crash after step 2 ----------------
  await kill9(ex);
  const t2 = 'ut-pilot-2';
  await port.start(t2, {});
  const crashing = startExecutor({ CRASH_AFTER_STEP: 'run', CRASH_TASK: t2 }).catch(() => null);
  await crashing;
  await waitUntil('crash', async () => executorPids().length === 0, 30000);
  const afterCrash = { counters: await counters(pool, t2), steps: await stepsDone(t2), task: await taskStatus(t2),
    engine: (await port.status(t2)).engine };
  log('after crash', JSON.stringify(afterCrash));
  ex = await startExecutor();
  await waitUntil('t2 awaiting', async () => (await taskStatus(t2)) === 'awaiting_input');
  const afterRecovery = { counters: await counters(pool, t2), steps: await stepsDone(t2),
    generation: (await port.status(t2)).task.generation };
  const recovered = (await port.raw.getWorkflow(t2)) as any;

  // ---------------- T3 wait without resources (+ T5 duplicate signal) ----------------
  await sleep(1000);
  const execRssWaiting = kb(ex.pid!, 'VmRSS'); const pgWhileExecAlive = pgMem();
  await kill9(ex);
  const aliveDuringWait = executorPids();
  const pgWhileExecDead = pgMem();
  const statusWhileDead = await port.status(t2);
  await port.signal(t2, 'user_reply', { answer: 'да' }, 'reply-2');
  await port.signal(t2, 'user_reply', { answer: 'да' }, 'reply-2');       // T5: duplicate, same idempotency key
  await port.signal(t2, 'user_reply', { answer: 'нет' }, 'reply-2-other'); // T5b: a different 2nd message
  const msgs = (await pool.query(`SELECT count(*)::int n FROM dbos.notifications WHERE destination_uuid=$1`, [t2])).rows[0].n;
  const tRestart = Date.now();
  ex = await startExecutor();
  await waitUntil('t2 done', async () => (await taskStatus(t2)) === 'done');
  const restartToDone = Date.now() - tRestart;
  await waitUntil('t2 engine SUCCESS', async () => (await port.status(t2)).engine === 'SUCCESS');
  const c2 = await counters(pool, t2); const s2 = await stepsDone(t2); const st2 = await port.status(t2);
  const leftover = (await pool.query(`SELECT message_uuid, consumed FROM dbos.notifications WHERE destination_uuid=$1 ORDER BY created_at_epoch_ms`, [t2])).rows;
  record('T2', afterCrash.counters.prepare === 1 && afterCrash.counters.run === 1 && afterRecovery.counters.prepare === 1 &&
    afterRecovery.counters.run === 1 && st2.task.status === 'done',
    { after_crash: afterCrash, after_restart: afterRecovery, recovery_attempts: recovered?.recoveryAttempts, final: st2 });
  record('T3', aliveDuringWait.length === 0 && st2.task.status === 'done',
    { executor_processes_during_wait: aliveDuringWait.length, task_status_while_dead: statusWhileDead,
      executor_rss_kb_while_waiting: execRssWaiting, postgres_while_executor_alive: pgWhileExecAlive,
      postgres_while_executor_dead: pgWhileExecDead, restart_to_done_ms: restartToDone });
  results.metrics.executor_rss_kb_waiting = execRssWaiting; results.metrics.postgres_mem = pgWhileExecDead;
  results.metrics.restart_to_done_ms = restartToDone;
  record('T5', c2.apply === 1, { messages_persisted_after_3_sends: msgs, counters: c2, applied_payload:
      (await history(t2)).find(e => e.step === 'apply')?.payload, notifications_after_done: leftover, steps: s2 });

  // ---------------- T6 fencing: stale attempt writes a step result ----------------
  const stale = afterCrash.counters && 1;                     // generation of the crashed (first) attempt
  const t6 = 'ut-pilot-6';
  await port.start(t6, {});
  await waitUntil('t6 awaiting', async () => (await taskStatus(t6)) === 'awaiting_input');
  const g6 = (await port.status(t6)).task.generation;
  const snap = async (id: string) => JSON.stringify([(await pool.query(`SELECT status, generation, current_step, result FROM tasks WHERE id=$1`, [id])).rows[0],
    (await pool.query(`SELECT count(*)::int FROM task_events WHERE task_id=$1`, [id])).rows[0], await counters(pool, id)]);
  // simulate a newer attempt taking over (e.g. a recovery on another executor): bump generation
  await pool.query(`UPDATE tasks SET generation = generation + 1, owner='pid:new-owner' WHERE id=$1`, [t6]);
  const before6 = await snap(t6);
  let rej6 = '';
  try { await fencedStep(pool, t6, g6, 'apply', { status: 'done', result: { answer: 'stale' } }, async c => { await c.query(`INSERT INTO side_effects VALUES ($1,'apply',1) ON CONFLICT (task_id,name) DO UPDATE SET count=side_effects.count+1`, [t6]); }); rej6 = 'ACCEPTED'; }
  catch (e: any) { rej6 = e instanceof StaleGenerationError ? e.message : 'other error: ' + e.message; }
  const after6 = await snap(t6);
  // and on the finished T2: the crashed attempt's generation (1) tries to overwrite the result
  let rej2 = '';
  const b2 = await snap(t2);
  try { await fencedStep(pool, t2, stale, 'finalize', { status: 'failed', result: { answer: 'stale' } }); rej2 = 'ACCEPTED'; }
  catch (e: any) { rej2 = e.message; }
  record('T6', rej6 !== 'ACCEPTED' && before6 === after6 && rej2 !== 'ACCEPTED' && b2 === await snap(t2),
    { live_task: { stale_generation: g6, rejection: rej6, state_unchanged: before6 === after6 },
      finished_task: { stale_generation: stale, rejection: rej2 } });
  await port.cancel(t6);

  // ---------------- T7 cancel during wait ----------------
  const t7 = 'ut-pilot-7';
  await port.start(t7, {});
  await waitUntil('t7 awaiting', async () => (await taskStatus(t7)) === 'awaiting_input');
  await port.cancel(t7);
  await port.signal(t7, 'user_reply', { answer: 'да' }, 'reply-7');
  await sleep(1000);
  await kill9(ex);
  ex = await startExecutor();
  await sleep(3000);
  const st7 = await port.status(t7); const c7 = await counters(pool, t7);
  const after7 = (await pool.query(`SELECT count(*)::int n FROM task_events WHERE task_id=$1 AND id > (SELECT id FROM task_events WHERE task_id=$1 AND kind='cancel')
     AND kind IN ('step_done','claim')`, [t7])).rows[0].n;
  record('T7', st7.engine === 'CANCELLED' && st7.task.status === 'cancelled' && !c7.apply && after7 === 0,
    { status: st7, counters: c7, step_or_claim_events_after_cancel: after7, steps: await stepsDone(t7) });

  // ---------------- T8 observability: one SQL ----------------
  const sql = `SELECT t.id, t.status, t.generation, t.result,
       json_agg(json_build_object('g', e.generation, 'kind', e.kind, 'step', e.step, 'at', to_char(e.created_at,'HH24:MI:SS.MS')) ORDER BY e.id) AS history
  FROM tasks t JOIN task_events e ON e.task_id = t.id WHERE t.id = $1 GROUP BY t.id`;
  const r8 = (await pool.query(sql, [t2])).rows[0];
  record('T8', !!r8 && r8.history.length > 0, { sql: sql.replace(/\s+/g, ' '), row: r8 });

  // engine view of the same (DBOS system tables) for comparison
  results.metrics.dbos_steps_t2 = (await port.raw.listWorkflowSteps(t2))?.map(s => s.name);
  results.metrics.dbos_system_tables = (await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='dbos' ORDER BY 1`)).rows.map(r => r.table_name);
  results.metrics.executor_count_used = execN;
  const loc = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter(l => l.trim() && !/^\s*\/\//.test(l)).length;
  results.metrics.adapter_loc = Object.fromEntries(['src/port.ts', 'src/taskstore.ts', 'src/workflow.ts', 'src/executor.ts'].map(f => [f, loc(f)]));
  results.metrics.moving_parts = ['Postgres (Task Store tables + dbos system schema, one DB)', 'executor node process(es) with DBOS library'];
  results.metrics.verified_locally = ['T1-T8 as in tests', 'kill -9 recovery on relaunch (same executorID=local)', 'send before recv persisted', 'send idempotencyKey dedup', 'cancelWorkflow survives restart', 'sendInTransaction atomic with Task Store journal', 'RSS'];
  results.metrics.from_docs_only = ['multi-VM recovery of a dead executor (needs Conductor or manual recoverPendingWorkflows by executorID)', 'app version upgrade with pending workflows', 'recv timeout firing after 24h while executor down', 'Conductor pricing/licence', 'transactional steps via datasource packages (exactly-once DB writes)'];

  await kill9(ex);
  await port.close();
  await pool.end();
  fs.writeFileSync(path.join(ROOT, 'results.json'), JSON.stringify(results, null, 2));
  const all = Object.entries(results.tests).map(([k, v]: any) => `${k}=${v.result}`).join(' ');
  log('SUMMARY', all);
}
main().catch(async e => { console.error('DRIVER FAILED', e); for (const p of executorPids()) try { process.kill(p, 'SIGKILL'); } catch {} process.exit(1); });
