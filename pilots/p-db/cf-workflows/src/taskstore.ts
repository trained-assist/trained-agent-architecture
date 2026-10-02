// Task Store repository over D1. Source of truth: status column + task_events history.
// Every write made on behalf of an executor is fenced by `generation` (INV-02):
// all statements of a commit are guarded by `EXISTS(tasks.generation = ?)` and run
// in one D1 batch (= one transaction), so a stale writer changes nothing.

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
];

export class FencedError extends Error {}

/** Statuses that may never be changed again (INV-03): Reporting reads them as-is (INV-20). */
export const TERMINAL_STATUSES = ['done', 'failed', 'cancelled'] as const;
const TERMINAL_SQL = `status NOT IN ('done','failed','cancelled')`;

/** A write arrived for a task that already reached a terminal status (issue #90). */
export class TerminalStateError extends Error {}

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
}
