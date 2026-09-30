'use strict';
// Workflow Port adapter over the CURRENT PROD plans mechanism (origin/main src/,
// vendored read-only into ./vendor). Everything below delegates to prod modules:
//   start  -> DurableTaskStore.createPlan + task_update(active)
//   step   -> an "agent" plan item; executed by runDueDurable with an injected
//             runTask (see executor.js) that answers with the DURABLE: marker
//   waitFor-> MCP task_item_wait(awaiting_user) + "DURABLE: waiting" (inside the step)
//   signal -> MCP task_item_wake (+ durable-kick notify, as prod does)
//   cancel -> MCP task_update(status=cancelled)
//   status -> durable_tasks / task_items / executions rows
// Env (HOME, AGENT_DATA_DIR, USERS_DIR, AGENT_TOKENS_*) MUST point into ./sandbox.
const path = require('path');
const VSRC = path.join(__dirname, 'vendor', 'src');
const PROFILE = 'pilot';
const CTX = { userId: PROFILE };

let _mods = null;
function mods() {
  if (_mods) return _mods;
  const G = require(path.join(VSRC, 'gtd-controller.js'));
  const { tools } = require(path.join(VSRC, 'mcp-skills', 'tools', '101-durable-tasks.js'));
  _mods = { G, tools, store: G.durableStore() };
  return _mods;
}

// Port definition -> prod plan items. One item per Port step; waitFor is a step
// whose body parks on a user wait. The step "program" is NOT stored: prod items
// carry free-text `instructions` for an LLM; we put a JSON spec there and the
// deterministic executor maps title -> function (see steps.js).
function toItems(userTaskId, definition) {
  return definition.steps.map(s => ({
    title: s.name,
    execution_kind: 'agent', executor_role: 'developer', minimum_model_level: 'bachelor', context_budget: 'small',
    instructions: JSON.stringify({ kind: s.kind || 'step', eventType: s.eventType || null, timeoutSec: s.timeoutSec || null }),
    // step result artifact written by the step; checked by the prod file_exists validator
    validation: { file_exists: `pilot-artifacts/${userTaskId}/${s.name}.json` },
    max_attempts: (s.retry && s.retry.maxAttempts) || 3,
  }));
}

function start(userTaskId, definition, input = {}) {
  const { store, tools } = mods();
  const existing = store.getTask(userTaskId, PROFILE);
  if (existing) return { instance: userTaskId, created: false, status: existing.status };
  try {
    store.createPlan({
      id: userTaskId, profile_id: PROFILE, goal: definition.name,
      user_value: JSON.stringify(input), // no input column in prod schema -> user_value
      acceptance_criteria: [{ id: 'all-steps', description: 'every step wrote its artifact' }],
      items: toItems(userTaskId, definition),
      execution_policy: { validation_mode: 'programmatic', finalization: 'strict' },
    });
  } catch (e) {
    if (/UNIQUE|PRIMARY/i.test(e.message)) return { instance: userTaskId, created: false };
    throw e;
  }
  // contract plans start as draft; activation is the prod task_update call
  return tools.task_update.handler({ task_id: userTaskId, status: 'active' }, CTX)
    .then(r => ({ instance: userTaskId, created: true, status: r.task && r.task.status }));
}

// signal: prod has no event types and no inbox. The target is "the step that
// waits for eventType"; prod wakes it only if it is ALREADY parked.
async function signal(instance, eventType, payload) {
  const { store, tools } = mods();
  const items = store.listTaskItems(instance, PROFILE);
  const target = items.find(i => { try { return JSON.parse(i.instructions).eventType === eventType; } catch { return false; } });
  if (!target) return { error: `no step waits for ${eventType}` };
  return tools.task_item_wake.handler({ item_id: target.id, message: JSON.stringify({ eventType, payload }) }, CTX);
}

async function cancel(instance) {
  const { tools } = mods();
  return tools.task_update.handler({ task_id: instance, status: 'cancelled' }, CTX);
}

function status(instance) {
  const { store } = mods();
  const task = store.getTask(instance, PROFILE);
  if (!task) return null;
  const items = store.listTaskItems(instance, PROFILE).map(i => ({
    step: i.title, status: i.status, attempts: i.attempt_count,
    wait: i.wait_json ? JSON.parse(i.wait_json).resolved || 'parked' : null,
    result: (() => { try { const m = /RESULT: (.*)/.exec(JSON.parse(i.evidence_json).reply); return m ? JSON.parse(m[1]) : null; } catch { return null; } })(),
  }));
  return { instance, status: task.status, revision: task.revision, items };
}

module.exports = { start, signal, cancel, status, mods, PROFILE, CTX, VSRC };
