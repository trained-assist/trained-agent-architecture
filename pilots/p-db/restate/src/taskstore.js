'use strict';
// Task Store = source of truth (ARCHITECTURE §4.1). Separate SQLite file.
// Restate keeps ONLY orchestration state (journal, promises) in its own log/RocksDB
// under restate-data/. Everything that must survive the engine lives here.
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,                 -- userTaskId
  status TEXT NOT NULL CHECK(status IN ('pending','running','awaiting_input','done','failed','cancelled')),
  engine TEXT NOT NULL DEFAULT 'restate',
  engine_instance TEXT,                -- restate invocation id
  generation INTEGER NOT NULL DEFAULT 0,  -- attempt generation for fencing (INV-02)
  owner TEXT,                          -- executor pid/host of current generation
  result_json TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  kind TEXT NOT NULL,                  -- step_done / status / signal / fencing_rejected ...
  step TEXT, generation INTEGER, payload_json TEXT, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS side_effects (
  task_id TEXT NOT NULL, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, name)
);`;

class TaskStore {
  constructor(file) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA);
  }
  now() { return Date.now(); }

  ensureTask(id) {
    this.db.prepare(`INSERT OR IGNORE INTO tasks(id,status,created_at,updated_at) VALUES(?, 'pending', ?, ?)`)
      .run(id, this.now(), this.now());
  }
  setInstance(id, inv) { this.db.prepare(`UPDATE tasks SET engine_instance=? WHERE id=?`).run(inv, id); }

  // New attempt of the executor (each handler (re)execution) claims a new generation.
  claimGeneration(id, owner) {
    return this.db.transaction(() => {
      this.ensureTask(id);
      const r = this.db.prepare(`UPDATE tasks SET generation=generation+1, owner=?, updated_at=? WHERE id=? RETURNING generation`)
        .get(owner, this.now(), id);
      this.event(id, 'attempt_claimed', null, r.generation, { owner });
      return r.generation;
    })();
  }

  event(id, kind, step, gen, payload) {
    this.db.prepare(`INSERT INTO task_events(task_id,kind,step,generation,payload_json,at) VALUES(?,?,?,?,?,?)`)
      .run(id, kind, step, gen ?? null, payload == null ? null : JSON.stringify(payload), this.now());
  }

  // Fenced write: step completion + side-effect counter + optional status change in ONE txn.
  // Rejected (no state change) if gen is not the current generation, or task is terminal.
  commitStep(id, gen, step, { sideEffect, status, result, payload } = {}) {
    return this.db.transaction(() => {
      const t = this.db.prepare(`SELECT generation, status FROM tasks WHERE id=?`).get(id);
      if (!t || t.generation !== gen || ['cancelled', 'done', 'failed'].includes(t.status) && status !== 'cancelled') {
        return { ok: false, reason: !t ? 'no task' : t.generation !== gen ? `stale generation ${gen} != ${t.generation}` : `terminal ${t.status}` };
      }
      if (sideEffect) this.db.prepare(`INSERT INTO side_effects(task_id,name,count) VALUES(?,?,1)
        ON CONFLICT(task_id,name) DO UPDATE SET count=count+1`).run(id, sideEffect);
      const upd = this.db.prepare(`UPDATE tasks SET status=COALESCE(?,status), result_json=COALESCE(?,result_json), updated_at=?
        WHERE id=? AND generation=?`).run(status ?? null, result == null ? null : JSON.stringify(result), this.now(), id, gen);
      if (upd.changes !== 1) throw new Error('fencing race');
      this.event(id, step ? 'step_done' : 'status', step, gen, payload ?? (status ? { status } : null));
      return { ok: true };
    })();
  }

  recordRejected(id, gen, step, reason) { this.event(id, 'fencing_rejected', step, gen, { reason }); }

  counters(id) {
    const o = { prepare: 0, run: 0, apply: 0 };
    for (const r of this.db.prepare(`SELECT name,count FROM side_effects WHERE task_id=?`).all(id)) o[r.name] = r.count;
    return o;
  }
  task(id) { return this.db.prepare(`SELECT * FROM tasks WHERE id=?`).get(id); }

  // T8: status + history in ONE SQL query.
  static OBS_SQL = `SELECT t.id, t.status, t.generation, t.result_json,
      (SELECT json_group_array(json_object('seq',e.seq,'kind',e.kind,'step',e.step,'gen',e.generation))
         FROM task_events e WHERE e.task_id=t.id) AS history
    FROM tasks t WHERE t.id = ?`;
  observe(id) { return this.db.prepare(TaskStore.OBS_SQL).get(id); }
  close() { this.db.close(); }
}
module.exports = { TaskStore };
