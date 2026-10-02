// Task Store repository over D1. Source of truth: status column + task_events history.
// Every write made on behalf of an executor is fenced by `generation` (INV-02):
// all statements of a commit are guarded by `EXISTS(tasks.generation = ?)` and run
// in one D1 batch (= one transaction), so a stale writer changes nothing.
//
// Issue #116: an atomic `wait` in D1 is NOT a delivered Workflows signal. Therefore:
//   task_waits   — the wait itself AND the single durable copy of the answer (consumed once),
//                  so the signal payload is never the only place the answer exists;
//   task_outbox  — pending operations: the INTENT to deliver (wake to the engine, wait-opened
//                  notice to the host) written in the same batch as the state it belongs to.
//                  Delivery happens afterwards and is at-least-once: `dedup_key` is UNIQUE, so
//                  a retry can never plan a second continuation, and a duplicate wake event is
//                  dropped by the engine once the wait is consumed;
//   task_faults  — controlled failure points, so the crash windows can be exercised on demand.
import { PROFILE_ID, eventKeyFor, logCtx, runIdFor, waitIdFor } from './ids';

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    status      TEXT NOT NULL CHECK (status IN ('pending','running','awaiting_input','done','failed','cancelled')),
    generation  INTEGER NOT NULL DEFAULT 1,
    instance_id TEXT,
    result_json TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS task_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    TEXT NOT NULL REFERENCES tasks(id),
    kind       TEXT NOT NULL,
    step       TEXT,
    generation INTEGER,
    payload    TEXT,
    at         INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, id)`,
  `CREATE TABLE IF NOT EXISTS side_effects (
    task_id TEXT NOT NULL, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id, name))`,
  // Durable wait + the single durable copy of the answer. status is the consume guard:
  // only the first submission may move open -> answered, only the first wake may move answered -> consumed.
  `CREATE TABLE IF NOT EXISTS task_waits (
    task_id          TEXT NOT NULL,
    wait_id          TEXT NOT NULL,
    step             TEXT NOT NULL,
    generation       INTEGER NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('open','answered','consumed','cancelled')),
    expect_version   TEXT,
    answer_event_key TEXT,
    answer_json      TEXT,
    created_at       INTEGER NOT NULL,
    submitted_at     INTEGER,
    consumed_at      INTEGER,
    PRIMARY KEY (task_id, wait_id))`,
  `CREATE INDEX IF NOT EXISTS idx_waits_open ON task_waits(status, task_id)`,
  // Pending operations (outbox). dedup_key UNIQUE = "planned at most once, delivered at least once".
  `CREATE TABLE IF NOT EXISTS task_outbox (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    dedup_key    TEXT NOT NULL UNIQUE,
    task_id      TEXT NOT NULL,
    wait_id      TEXT,
    kind         TEXT NOT NULL,
    event_type   TEXT NOT NULL,
    payload_json TEXT,
    status       TEXT NOT NULL CHECK (status IN ('pending','delivered','cancelled','failed')),
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    reason       TEXT,
    profile_id   TEXT,
    run_id       TEXT,
    created_at   INTEGER NOT NULL,
    delivered_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_pending ON task_outbox(status, id)`,
  `CREATE TABLE IF NOT EXISTS task_faults (name TEXT PRIMARY KEY, value TEXT, created_at INTEGER NOT NULL)`,
];

export class FencedError extends Error {}

/** Statuses that may never be changed again (INV-03): Reporting reads them as-is (INV-20). */
export const TERMINAL_STATUSES = ['done', 'failed', 'cancelled'] as const;
const TERMINAL_SQL = `status NOT IN ('done','failed','cancelled')`;

/** A write arrived for a task that already reached a terminal status (issue #90). */
export class TerminalStateError extends Error {}

/** The instance woke but the durable wait holds no answer: the signal alone is not enough (#116). */
export class MissingAnswerError extends Error {}

const resLen = (a: unknown[]) => a.length;

export class TaskStore {
  constructor(private db: D1Database) {}

  async init() {
    await this.db.batch(SCHEMA.map((s) => this.db.prepare(s)));
  }

  async createTask(id: string, instanceId: string) {
    const now = Date.now();
    const r = await this.db
      .prepare(`INSERT OR IGNORE INTO tasks(id,status,generation,instance_id,created_at,updated_at) VALUES(?,?,1,?,?,?)`)
      .bind(id, 'pending', instanceId, now, now)
      .run();
    return r.meta.changes === 1;
  }

  async getTask(id: string) {
    return this.db.prepare(`SELECT * FROM tasks WHERE id=?`).bind(id).first<any>();
  }

  async logEvent(taskId: string, kind: string, step: string | null, payload: unknown, generation: number | null = null, at: number = Date.now()) {
    await this.db
      .prepare(`INSERT INTO task_events(task_id,kind,step,generation,payload,at) VALUES(?,?,?,?,?,?)`)
      .bind(taskId, kind, step, generation, payload == null ? null : JSON.stringify(payload), at)
      .run();
  }

  /**
   * Fenced step commit: status change + history event + side-effect counter + result, atomically.
   * Two independent guards, both evaluated before the write (issue #90):
   *   generation fencing (INV-02) — a stale attempt owner changes nothing;
   *   terminal-status guard (INV-03) — `done/failed/cancelled` are immutable, so a late
   *   `wait_timeout`/retry arriving after `finalize` can neither flip the status nor rewrite
   *   `result_json`, and leaves no `step_done` row behind (all statements share the WHERE clause).
   */
  async commitStep(
    taskId: string,
    generation: number,
    step: string,
    opts: { status?: string; effect?: string; result?: unknown; payload?: unknown; kind?: string },
  ) {
    const now = Date.now();
    const guard = `EXISTS (SELECT 1 FROM tasks WHERE id=? AND generation=? AND ${TERMINAL_SQL})`;
    // ORDER MATTERS: the batch runs sequentially in one transaction, so the guards of the
    // history/effect statements must be evaluated on the PRE-write status. If the status UPDATE
    // went first, `finalize` (running -> done) would make its own history row fail the
    // terminal guard and disappear. UPDATE therefore runs last and is the sentinel we check.
    const stmts: D1PreparedStatement[] = [
      this.db
        .prepare(`INSERT INTO task_events(task_id,kind,step,generation,payload,at) SELECT ?,?,?,?,?,? WHERE ${guard}`)
        .bind(taskId, opts.kind ?? 'step_done', step, generation, opts.payload == null ? null : JSON.stringify(opts.payload), now, taskId, generation),
    ];
    if (opts.effect) {
      stmts.push(
        this.db
          .prepare(
            `INSERT INTO side_effects(task_id,name,count) SELECT ?,?,1 WHERE ${guard}
             ON CONFLICT(task_id,name) DO UPDATE SET count=count+1`,
          )
          .bind(taskId, opts.effect, taskId, generation),
      );
    }
    stmts.push(
      this.db
        .prepare(
          `UPDATE tasks SET status=COALESCE(?,status), result_json=COALESCE(?,result_json), updated_at=?
           WHERE id=? AND generation=? AND ${TERMINAL_SQL}`,
        )
        .bind(opts.status ?? null, opts.result === undefined ? null : JSON.stringify(opts.result), now, taskId, generation),
    );
    const res = await this.db.batch(stmts);
    const statusUpdate = res[res.length - 1];
    if (statusUpdate.meta.changes !== 1) {
      const cur = await this.getTask(taskId);
      if (cur && cur.generation === generation && TERMINAL_STATUSES.includes(cur.status)) {
        await this.logEvent(taskId, 'late_write_rejected', step, {
          status: cur.status,
          attemptedStatus: opts.status ?? null,
          attemptedKind: opts.kind ?? 'step_done',
        });
        throw new TerminalStateError(`terminal: task ${taskId} is ${cur.status}; write of step ${step} rejected`);
      }
      await this.logEvent(taskId, 'fenced', step, { rejectedGeneration: generation, currentGeneration: cur?.generation });
      throw new FencedError(`fenced: task ${taskId} step ${step} gen ${generation} != current ${cur?.generation}`);
    }
    return now;
  }

  /** New attempt owner: bump generation (e.g. lease expired, cancel). Returns new generation. */
  async bumpGeneration(taskId: string, status?: string) {
    const r = await this.db
      .prepare(`UPDATE tasks SET generation=generation+1, status=COALESCE(?,status), updated_at=? WHERE id=? RETURNING generation`)
      .bind(status ?? null, Date.now(), taskId)
      .first<{ generation: number }>();
    return r?.generation;
  }

  async unfinishedTasks() {
    const r = await this.db.prepare(`SELECT id FROM tasks WHERE status IN ('pending','running','awaiting_input')`).all<{ id: string }>();
    return r.results;
  }

  /** T8: status + history (with payload) + counters in ONE SQL query. */
  static readonly STATUS_SQL = `
SELECT t.id, t.status, t.generation, t.result_json,
  (SELECT json_group_object(name, count) FROM side_effects s WHERE s.task_id = t.id) AS side_effects,
  (SELECT json_group_array(json_object('kind', e.kind, 'step', e.step, 'gen', e.generation, 'at', e.at, 'payload', e.payload))
     FROM (SELECT * FROM task_events WHERE task_id = t.id ORDER BY id) e) AS history
FROM tasks t WHERE t.id = ?`;

  async statusRow(taskId: string) {
    return this.db.prepare(TaskStore.STATUS_SQL).bind(taskId).first<any>();
  }

  /** #116 view for evidence: durable waits (with the answer) + pending/delivered operations. */
  static readonly STATE_SQL = `
SELECT t.id, t.status, t.generation,
  (SELECT json_group_array(json_object('wait_id', w.wait_id, 'step', w.step, 'gen', w.generation,
      'status', w.status, 'expect_version', w.expect_version, 'event_key', w.answer_event_key,
      'answer', w.answer_json, 'created_at', w.created_at, 'submitted_at', w.submitted_at, 'consumed_at', w.consumed_at))
     FROM (SELECT * FROM task_waits WHERE task_id = t.id ORDER BY created_at) w) AS waits,
  (SELECT json_group_array(json_object('id', o.id, 'dedup_key', o.dedup_key, 'kind', o.kind,
      'event_type', o.event_type, 'status', o.status, 'attempts', o.attempts, 'reason', o.reason,
      'run_id', o.run_id, 'profile_id', o.profile_id, 'created_at', o.created_at, 'delivered_at', o.delivered_at))
     FROM (SELECT * FROM task_outbox WHERE task_id = t.id ORDER BY id) o) AS outbox
FROM tasks t WHERE t.id = ?`;

  async stateRow(taskId: string) {
    return this.db.prepare(TaskStore.STATE_SQL).bind(taskId).first<any>();
  }

  // ---------------------------------------------------------------------------------------------
  // #116: durable wait, atomic submission, pending operations (outbox)
  // ---------------------------------------------------------------------------------------------

  /**
   * Requirement (1) of #116: atomically persist wait + task transition + delivery intent.
   * One batch: the wait row, the `wait_opened` pending operation for the host, the history row and
   * the task transition. Idempotent (ON CONFLICT DO NOTHING): a retried plan step cannot create a
   * second wait nor a second delivery intent, and an answer submitted BEFORE the wait was opened
   * (early answer) survives — the row is reused and read back as `answered`.
   */
  async openWait(taskId: string, generation: number, opts: { step: string; version?: string | null }) {
    const now = Date.now();
    const waitId = waitIdFor(taskId, opts.step, generation);
    const runId = runIdFor(taskId, generation);
    const guard = `EXISTS (SELECT 1 FROM tasks WHERE id=? AND generation=? AND ${TERMINAL_SQL})`;
    const notice = JSON.stringify(logCtx(taskId, generation, { waitId, waitFor: opts.step, version: opts.version ?? null, intent: 'deliver_wait_notice' }));
    const res = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO task_waits(task_id,wait_id,step,generation,status,expect_version,created_at)
           SELECT ?,?,?,?,'open',NULL,? WHERE ${guard}
           ON CONFLICT(task_id,wait_id) DO NOTHING`,
        )
        .bind(taskId, waitId, opts.step, generation, now, taskId, generation),
      this.db
        .prepare(
          `INSERT INTO task_outbox(dedup_key,task_id,wait_id,kind,event_type,payload_json,status,reason,profile_id,run_id,created_at)
           SELECT ?,?,?,'wait_opened','user_reply_requested',?,'pending','wait_opened',?,?,? WHERE ${guard}
           ON CONFLICT(dedup_key) DO NOTHING`,
        )
        .bind(`${waitId}#opened`, taskId, waitId, notice, PROFILE_ID, runId, now, taskId, generation),
      this.db
        .prepare(`INSERT INTO task_events(task_id,kind,step,generation,payload,at) SELECT ?,?,?,?,?,? WHERE ${guard}`)
        .bind(taskId, 'status', 'wait', generation, notice, now, taskId, generation),
      this.db
        .prepare(`UPDATE tasks SET status=COALESCE('awaiting_input',status), updated_at=? WHERE id=? AND generation=? AND ${TERMINAL_SQL}`)
        .bind(now, taskId, generation),
    ]);
    if (res[3].meta.changes !== 1) {
      const cur = await this.getTask(taskId);
      if (cur && cur.generation === generation && TERMINAL_STATUSES.includes(cur.status))
        throw new TerminalStateError(`terminal: task ${taskId} is ${cur.status}; wait of step ${opts.step} rejected`);
      throw new FencedError(`fenced: task ${taskId} wait ${waitId} gen ${generation} != current ${cur?.generation}`);
    }
    return { waitId, wait: await this.readWait(taskId, waitId), at: now };
  }

  async readWait(taskId: string, waitId: string) {
    return this.db.prepare(`SELECT * FROM task_waits WHERE task_id=? AND wait_id=?`).bind(taskId, waitId).first<any>();
  }

  /**
   * The durable answer, read back on every wake. Deliberately returns the answer for a `consumed`
   * wait too: a replayed plan step (engine crash mid-plan) must be able to continue from state,
   * not from the (already spent) signal event.
   */
  async readAnswer(taskId: string, waitId: string) {
    const row = await this.readWait(taskId, waitId);
    if (!row || row.answer_json == null) return null;
    return {
      answer: JSON.parse(row.answer_json),
      eventKey: row.answer_event_key,
      expectVersion: row.expect_version,
      waitStatus: row.status,
      submittedAt: row.submitted_at,
    };
  }

  /**
   * Requirement (2) of #116: atomically persist the answer + the consume/version guard + the
   * continuation intent. One batch; the `UPDATE ... WHERE status='open'` is the consume guard
   * (exactly one acceptance per wait), the outbox row is the continuation intent and its
   * `dedup_key` is UNIQUE, so duplicates can never plan a second continuation.
   * Returns why a submission was rejected instead of silently doing nothing.
   */
  async submitAnswer(args: {
    taskId: string;
    step?: string;
    generation?: number | null;
    eventType?: string;
    eventKey?: string | null;
    answer: unknown;
    expectVersion?: string | null;
    profileId?: string;
  }): Promise<{ accepted: boolean; reason: string; waitId: string; generation: number; eventKey: string; outboxId: number | null; waited: boolean }> {
    const now = Date.now();
    const step = args.step ?? 'wait';
    const eventType = args.eventType ?? 'user_reply';
    const cur = await this.getTask(args.taskId);
    const generation = args.generation ?? cur?.generation ?? 1;
    const waitId = waitIdFor(args.taskId, step, generation);
    const runId = runIdFor(args.taskId, generation);
    const eventKey = eventKeyFor(waitId, eventType, args.eventKey);
    const answerJson = JSON.stringify(args.answer ?? null);
    const guardTask = `EXISTS (SELECT 1 FROM tasks WHERE id=? AND generation=? AND ${TERMINAL_SQL})`;
    // the consume guard: open -> answered, current generation, task not terminal
    const accept = `task_id=? AND wait_id=? AND status='open' AND generation=?
                    AND EXISTS (SELECT 1 FROM tasks WHERE id=? AND generation=? AND ${TERMINAL_SQL})`;
    const res = await this.db.batch([
      // arrival record (kept for the signal -> step latency metric); no answer inside
      this.db
        .prepare(`INSERT INTO task_events(task_id,kind,step,generation,payload,at) VALUES(?,?,?,?,?,?)`)
        .bind(
          args.taskId,
          'signal',
          eventType,
          generation,
          JSON.stringify(logCtx(args.taskId, generation, { waitId, eventKey, expectVersion: args.expectVersion ?? null, source: 'submission' })),
          now,
        ),
      // the wait row may not exist yet (early answer): create it in the same transaction
      this.db
        .prepare(
          `INSERT INTO task_waits(task_id,wait_id,step,generation,status,expect_version,created_at)
           SELECT ?,?,?,?,'open',?,? WHERE ${guardTask}
           ON CONFLICT(task_id,wait_id) DO NOTHING`,
        )
        .bind(args.taskId, waitId, step, generation, args.expectVersion ?? null, now, args.taskId, generation),
      // consume guard (the version expectation the control plane stated is kept, first non-null wins)
      this.db
        .prepare(
          `UPDATE task_waits SET status='answered', answer_json=?, answer_event_key=?,
             expect_version=COALESCE(expect_version, ?), submitted_at=? WHERE ${accept}`,
        )
        .bind(answerJson, eventKey, args.expectVersion ?? null, now, args.taskId, waitId, generation, args.taskId, generation),
      // continuation intent, planned at most once
      this.db
        .prepare(
          `INSERT INTO task_outbox(dedup_key,task_id,wait_id,kind,event_type,payload_json,status,reason,profile_id,run_id,created_at)
           SELECT ?,?,?,'wake',?,?,'pending','answer_accepted',?,?,?
           WHERE EXISTS (SELECT 1 FROM task_waits WHERE task_id=? AND wait_id=? AND status='answered' AND submitted_at=?)
           ON CONFLICT(dedup_key) DO NOTHING`,
        )
        .bind(
          `${waitId}#wake`,
          args.taskId,
          waitId,
          eventType,
          JSON.stringify(logCtx(args.taskId, generation, { waitId, eventKey, reason: 'answer_accepted' })),
          PROFILE_ID,
          runId,
          now,
          args.taskId,
          waitId,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO task_events(task_id,kind,step,generation,payload,at)
           SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM task_waits WHERE task_id=? AND wait_id=? AND status='answered' AND submitted_at=?)`,
        )
        .bind(
          args.taskId,
          'answer_accepted',
          'wait',
          generation,
          JSON.stringify(logCtx(args.taskId, generation, { waitId, eventKey, expectVersion: args.expectVersion ?? null })),
          now,
          args.taskId,
          waitId,
          now,
        ),
    ]);
    const took = res[2].meta.changes === 1;
    const outbox = await this.db
      .prepare(`SELECT id FROM task_outbox WHERE dedup_key=?`)
      .bind(`${waitId}#wake`)
      .first<{ id: number }>();
    if (took) return { accepted: true, reason: 'accepted', waitId, generation, eventKey, outboxId: outbox?.id ?? null, waited: true };
    const row = await this.readWait(args.taskId, waitId);
    const task = await this.getTask(args.taskId);
    let reason = 'rejected';
    if (!row) {
      // a cancelled wait of the same step (any generation) means the task was cancelled, not fenced
      const cancelled = await this.db
        .prepare(`SELECT wait_id FROM task_waits WHERE task_id=? AND step=? AND status='cancelled' ORDER BY created_at DESC LIMIT 1`)
        .bind(args.taskId, step)
        .first<{ wait_id: string }>();
      reason = cancelled ? 'cancelled' : task && TERMINAL_STATUSES.includes(task.status) ? 'terminal' : 'no_wait';
    } else if (row.status === 'cancelled') reason = 'cancelled';
    else if (row.status === 'consumed') reason = 'already_consumed';
    else if (row.answer_event_key === eventKey) reason = 'duplicate';
    else if (row.status === 'answered') reason = 'wait_answered';
    else if (task && task.generation !== row.generation) reason = 'fenced';
    await this.logEvent(
      args.taskId,
      'answer_rejected',
      'wait',
      logCtx(args.taskId, row?.generation ?? generation, { waitId, eventKey, reason, waitStatus: row?.status ?? null, taskStatus: task?.status ?? null }),
      row?.generation ?? generation,
    );
    return { accepted: false, reason, waitId, generation, eventKey, outboxId: outbox?.id ?? null, waited: false };
  }

  /**
   * Requirement (4) of #116: on wake the instance consumes the DURABLE answer. answered -> consumed
   * happens once (guard), together with the task transition and the history row, in one batch.
   */
  async consumeAnswer(taskId: string, waitId: string, generation: number, extra: Record<string, unknown> = {}) {
    const now = Date.now();
    const res = await this.db.batch([
      this.db
        .prepare(`UPDATE task_waits SET status='consumed', consumed_at=? WHERE task_id=? AND wait_id=? AND status='answered'`)
        .bind(now, taskId, waitId),
      this.db
        .prepare(`UPDATE tasks SET status=COALESCE('running',status), updated_at=? WHERE id=? AND generation=? AND ${TERMINAL_SQL}`)
        .bind(now, taskId, generation),
      this.db
        .prepare(
          `INSERT INTO task_events(task_id,kind,step,generation,payload,at)
           SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM task_waits WHERE task_id=? AND wait_id=? AND status='consumed' AND consumed_at=?)`,
        )
        .bind(
          taskId,
          'step_done',
          'wait',
          generation,
          JSON.stringify(logCtx(taskId, generation, { waitId, ...extra })),
          now,
          taskId,
          waitId,
          now,
        ),
    ]);
    if (res[0].meta.changes !== 1) throw new MissingAnswerError(`no answer to consume: ${waitId} is not 'answered'`);
    return now;
  }

  /** Pending operations, oldest first — the recovery loop replays exactly these. */
  async pendingOutbox(opts: { limit?: number; taskId?: string; kinds?: string[] } = {}) {
    const where: string[] = [`status='pending'`];
    const binds: unknown[] = [];
    if (opts.taskId) {
      where.push('task_id=?');
      binds.push(opts.taskId);
    }
    if (opts.kinds?.length) {
      where.push(`kind IN (${opts.kinds.map(() => '?').join(',')})`);
      binds.push(...opts.kinds);
    }
    binds.push(opts.limit ?? 20);
    const r = await this.db
      .prepare(`SELECT * FROM task_outbox WHERE ${where.join(' AND ')} ORDER BY id LIMIT ?`)
      .bind(...(binds as any[]))
      .all<any>();
    return r.results;
  }

  async markDelivered(id: number) {
    return this.db
      .prepare(`UPDATE task_outbox SET status='delivered', delivered_at=?, attempts=attempts+1, last_error=NULL WHERE id=?`)
      .bind(Date.now(), id)
      .run();
  }

  /** Delivery failed: the intent STAYS pending (at-least-once), attempts and the reason are kept. */
  async markDeliveryFailed(id: number, error: string) {
    return this.db
      .prepare(`UPDATE task_outbox SET status='pending', attempts=attempts+1, last_error=? WHERE id=?`)
      .bind(String(error).slice(0, 500), id)
      .run();
  }

  async ackOutbox(dedupKey: string) {
    return this.db
      .prepare(`UPDATE task_outbox SET status='delivered', delivered_at=? WHERE dedup_key=? AND status='pending'`)
      .bind(Date.now(), dedupKey)
      .run();
  }

  async outboxRows(taskId: string) {
    const r = await this.db
      .prepare(`SELECT * FROM task_outbox WHERE task_id=? ORDER BY id`)
      .bind(taskId)
      .all<any>();
    return r.results;
  }

  /**
   * Cancel is atomic too: the wait becomes `cancelled`, every pending operation is dropped and the
   * generation is bumped in the SAME batch — so a late callback can neither take the wait nor
   * plan a continuation (its consume guard fails on status/generation).
   */
  async cancelTask(taskId: string) {
    const now = Date.now();
    const before = await this.stateRow(taskId);
    const res = await this.db.batch([
      this.db
        .prepare(`UPDATE task_waits SET status='cancelled' WHERE task_id=? AND status IN ('open','answered')`)
        .bind(taskId),
      this.db
        .prepare(`UPDATE task_outbox SET status='cancelled', delivered_at=? WHERE task_id=? AND status='pending'`)
        .bind(now, taskId),
      this.db
        .prepare(`UPDATE tasks SET status='cancelled', generation=generation+1, updated_at=? WHERE id=? AND ${TERMINAL_SQL}`)
        .bind(now, taskId),
      this.db
        .prepare(`INSERT INTO task_events(task_id,kind,step,generation,payload,at) VALUES(?,?,?,?,?,?)`)
        .bind(
          taskId,
          'cancel',
          null,
          null,
          JSON.stringify(
            logCtx(taskId, 0, {
              reason: 'cancel_requested',
              waitsCancelled: JSON.parse(before?.waits ?? '[]').filter((w: any) => w.status === 'open' || w.status === 'answered').length,
              pendingDropped: resLen(JSON.parse(before?.outbox ?? '[]').filter((o: any) => o.status === 'pending')),
            }),
          ),
          now,
        ),
    ]);
    const cur = await this.getTask(taskId);
    return { generation: cur?.generation ?? null, status: cur?.status ?? null };
  }

  // --- controlled failure points (issue #116: exercise the crash windows on demand) ---------------

  async setFault(name: string, value: string) {
    await this.db
      .prepare(`INSERT INTO task_faults(name,value,created_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value`)
      .bind(name, value, Date.now())
      .run();
    return { name, value };
  }

  async clearFaults() {
    return this.db.prepare(`DELETE FROM task_faults`).run();
  }

  async fault(name: string) {
    const r = await this.db.prepare(`SELECT value FROM task_faults WHERE name=?`).bind(name).first<{ value: string }>();
    return r?.value ?? null;
  }

  /** One-shot fault: fires at most once (a plan step retry then sees a clean world). */
  async consumeFault(name: string) {
    const r = await this.db.prepare(`SELECT value FROM task_faults WHERE name=?`).bind(name).first<{ value: string }>();
    if (!r) return null;
    await this.db.prepare(`DELETE FROM task_faults WHERE name=?`).bind(name).run();
    return r.value;
  }
}
