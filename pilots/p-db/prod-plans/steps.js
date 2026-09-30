'use strict';
// The 5-step pilot definition + the deterministic "step runtime" that replaces
// the LLM agent run. Prod calls runTask({task: <prompt>, resumeSink}) and parses a
// `DURABLE: done|failed|waiting` marker from the reply text; here runTask runs a
// JS function and fabricates exactly that reply (RESULT: <json> + marker).
const fs = require('fs');
const path = require('path');
const Database = require(path.join(__dirname, 'vendor', 'node_modules', 'better-sqlite3'));
const { mods, PROFILE, CTX, VSRC } = require('./port');

const DEFINITION = {
  name: 'p-db pilot 5 steps',
  steps: [
    { name: 'prepare' },
    { name: 'run' },
    { name: 'wait', kind: 'waitFor', eventType: 'user_reply', timeoutSec: 24 * 3600 },
    { name: 'apply' },
    { name: 'finalize' },
  ],
};

// "External world": side-effect counters in a separate SQLite file.
let _fx = null;
function fx() {
  if (_fx) return _fx;
  _fx = new Database(path.join(process.env.AGENT_DATA_DIR, 'side_effects.db'));
  _fx.pragma('journal_mode = WAL');
  _fx.exec(`CREATE TABLE IF NOT EXISTS side_effects (task_id TEXT, step TEXT, n INTEGER NOT NULL DEFAULT 0, last_at INTEGER, PRIMARY KEY(task_id, step));`);
  return _fx;
}
function sideEffect(taskId, step) {
  fx().prepare(`INSERT INTO side_effects(task_id, step, n, last_at) VALUES (?,?,1,?)
    ON CONFLICT(task_id, step) DO UPDATE SET n = n + 1, last_at = excluded.last_at`).run(taskId, step, Date.now());
}
function counters(taskId) {
  const out = { prepare: 0, run: 0, apply: 0, finalize: 0 };
  for (const r of fx().prepare('SELECT step, n, last_at FROM side_effects WHERE task_id = ?').all(taskId)) out[r.step] = r.n;
  return out;
}
function sideEffectAt(taskId, step) {
  const r = fx().prepare('SELECT last_at FROM side_effects WHERE task_id = ? AND step = ?').get(taskId, step);
  return r ? r.last_at : null;
}

const hang = () => new Promise(() => {});

// Step bodies. `prev` = results of earlier steps (read back from the store).
const STEPS = {
  async prepare({ taskId, input }) { sideEffect(taskId, 'prepare'); return { prepared: true, input }; },
  async run({ taskId }) {
    sideEffect(taskId, 'run');
    if (process.env.HANG_IN_STEP === 'run') { console.log('CHECKPOINT in-step run (side effect done, not settled)'); await hang(); }
    return { external: 'ok' };
  },
  async apply({ taskId, prev }) {
    const answer = prev.wait && prev.wait.payload && prev.wait.payload.answer;
    if (answer !== 'да') throw new Error(`unexpected answer ${JSON.stringify(answer)}`);
    sideEffect(taskId, 'apply');
    return { applied: answer };
  },
  async finalize({ taskId, prev }) { sideEffect(taskId, 'finalize'); return { done: true, applied: prev.apply && prev.apply.applied }; },
};

function parseResult(item) {
  try { const m = /RESULT: (.*)/.exec(JSON.parse(item.evidence_json).reply); return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

function writeArtifact(taskId, step, result) {
  const { userWorkDir } = require(path.join(VSRC, 'data-paths.js'));
  const f = path.join(userWorkDir(PROFILE), 'pilot-artifacts', taskId, `${step}.json`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(result));
}

// Injected in place of prod's runner.runTask (the LLM agent run).
async function runTask(opts) {
  const { store, tools } = mods();
  const { taskId, itemId } = opts.resumeSink;
  const item = store.getTaskItem(itemId);
  const task = store.getTask(taskId, PROFILE);
  const spec = JSON.parse(item.instructions || '{}');
  const prev = {};
  for (const it of store.listTaskItems(taskId, PROFILE)) if (it.position < item.position) prev[it.title] = parseResult(it);
  console.log(`[runtime] exec step=${item.title} task=${taskId} attempt=${item.attempt_count}`);
  let result;
  if (spec.kind === 'waitFor') {
    const { parseWait } = require(path.join(VSRC, 'durable-wait.js'));
    const w = parseWait(item);
    if (!w || !w.resolved) {
      // Port waitFor -> prod task_item_wait(awaiting_user) + DURABLE: waiting
      const r = await tools.task_item_wait.handler({ item_id: itemId, awaiting_user: true, timeout_sec: spec.timeoutSec, reason: spec.eventType }, CTX);
      if (r.error) return `DURABLE: failed: ${r.error}`;
      return `waiting for ${spec.eventType}\nDURABLE: waiting`;
    }
    if (w.resolved !== 'woken') return `DURABLE: failed: wait ${w.resolved}`;
    let msg = null; try { msg = JSON.parse(w.wake_message); } catch { msg = { payload: w.wake_message }; }
    result = { eventType: spec.eventType, payload: msg && msg.payload };
  } else {
    try { result = await STEPS[item.title]({ taskId, input: JSON.parse(task.user_value || '{}'), prev }); }
    catch (e) { return `DURABLE: failed: ${e.message}`; }
  }
  writeArtifact(taskId, item.title, result);
  return `RESULT: ${JSON.stringify(result)}\nDURABLE: done`;
}

module.exports = { DEFINITION, STEPS, runTask, counters, sideEffectAt, fx, writeArtifact };
