'use strict';
// T6 fencing: a stale attempt writes a step result after the step was handed to
// a newer attempt. Run in-process (both "executors" are settle contexts), because
// on one VM the owner lock (execution-owner.sqlite) forbids two executor
// processes — the stale writer that CAN exist in prod is inside one process: the
// 45-min orphan grace re-queues a run that is still alive (runs may last 2h+).
const port = require('./port');
const { DEFINITION, writeArtifact } = require('./steps');

(async () => {
  const ID = 'ut-pilot-6';
  await port.start(ID, DEFINITION, { n: 6 });
  const { G, store } = port.mods();
  const P = port.PROFILE;
  const rowsOf = () => store.db.prepare(`SELECT i.title, i.status, i.attempt_count, i.last_execution_id,
      (SELECT json_group_array(json_object('id', e.id, 'status', e.status)) FROM executions e WHERE e.task_item_id = i.id) AS execs
    FROM task_items i WHERE i.task_id = ? ORDER BY i.position LIMIT 2`).all(ID);
  const rev = () => store.getTask(ID, P).revision;

  // attempt A (generation 1) claims step 1 exactly as runDueDurable does
  const now0 = Date.now();
  const a = G.claimNextDurableItem(store, { now: now0 });
  store.startExecution({ id: 'exec-A', task_id: ID, task_item_id: a.id });
  // A is still alive but slow. 46 min later the regular tick's orphan sweep
  // (RUNNING_ORPHAN_GRACE_MS = 45 min) re-queues it; attempt B claims it.
  const later = now0 + 46 * 60 * 1000;
  const requeued = G.reconcileOrphanedRunning(store, { now: later });
  const b = store.claimNextRunnable(later);
  store.startExecution({ id: 'exec-B', task_id: ID, task_item_id: b.id });
  const before = { revision: rev(), rows: rowsOf() };

  writeArtifact(ID, 'prepare', { stale: true });
  // stale A now reports "done" through the prod settle path (the same entry the
  // restart-resume uses): resumeDurableReply(sink, reply)
  await G.resumeDurableReply({ kind: 'durable', taskId: ID, itemId: a.id, executionId: 'exec-A', profileId: P },
    'RESULT: {"stale":true}\nDURABLE: done', { secrets: {} });
  const after = { revision: rev(), rows: rowsOf() };
  const staleAccepted = after.rows[0].status === 'done' && after.rows[0].last_execution_id === 'exec-A';
  const columns = store.db.prepare('PRAGMA table_info(task_items)').all().map(c => c.name)
    .concat(store.db.prepare('PRAGMA table_info(executions)').all().map(c => c.name));
  const fencingCols = columns.filter(c => /owner|lease|generation|fence|epoch|claim_token/i.test(c));
  console.log('T6JSON ' + JSON.stringify({ requeued, sameItem: a.id === b.id, before, after, staleAccepted, fencingCols }));
  // cleanup: cancel so later executors do not run it
  await port.cancel(ID);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
