// Task Store: source of truth for task status (column) + history (task_events).
// Lives in the same Postgres as the DBOS system schema, but in its own tables.
import { Pool, PoolClient } from 'pg';

export const DB_URL = process.env.PILOT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:55432/pilot';

export class StaleGenerationError extends Error {
  constructor(public taskId: string, public expected: number, public actual: number, public status: string) {
    super(`stale write rejected for ${taskId}: attempt generation=${expected}, current=${actual}, status=${status}`);
  }
}

export function makePool(max = 4) { return new Pool({ connectionString: DB_URL, max }); }

export async function migrate(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,               -- userTaskId == DBOS workflowID
      status      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','awaiting_input','done','failed','cancelled')),
      generation  INTEGER NOT NULL DEFAULT 0,     -- attempt generation (fencing, INV-02)
      owner       TEXT,                           -- executor that holds the current attempt
      current_step TEXT,
      result      JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE IF NOT EXISTS task_events (
      id          BIGSERIAL PRIMARY KEY,
      task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      generation  INTEGER,
      kind        TEXT NOT NULL,                  -- step_done | claim | signal | cancel
      step        TEXT,
      payload     JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, id);
    CREATE TABLE IF NOT EXISTS side_effects (
      task_id TEXT NOT NULL, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (task_id, name)
    );`);
}

export async function tx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

export async function createTask(pool: Pool, id: string) {
  await pool.query(`INSERT INTO tasks(id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [id]);
}

/** New attempt: bump generation, record owner. Runs on every (re)entry of the workflow. */
export async function claim(pool: Pool, id: string, owner: string): Promise<number | null> {
  return tx(pool, async c => {
    const r = await c.query(
      `UPDATE tasks SET generation = generation + 1, owner = $2, updated_at = clock_timestamp(),
              status = CASE WHEN status = 'pending' THEN 'running' ELSE status END
        WHERE id = $1 AND status NOT IN ('done','cancelled','failed') RETURNING generation`, [id, owner]);
    if (!r.rowCount) return null;
    const gen = r.rows[0].generation;
    await c.query(`INSERT INTO task_events(task_id, generation, kind, payload) VALUES ($1,$2,'claim',$3)`,
      [id, gen, JSON.stringify({ owner })]);
    return gen;
  });
}

/** Fenced write: only the current generation of a live task may record a step result. */
export async function fencedStep(pool: Pool, id: string, gen: number, step: string,
    patch: { status?: string; result?: unknown; payload?: unknown }, effect?: (c: PoolClient) => Promise<void>) {
  return tx(pool, async c => {
    const cur = await c.query(`SELECT status, generation FROM tasks WHERE id = $1 FOR UPDATE`, [id]);
    const row = cur.rows[0];
    if (!row || row.generation !== gen || ['cancelled', 'done', 'failed'].includes(row.status))
      throw new StaleGenerationError(id, gen, row?.generation, row?.status);
    if (effect) await effect(c);
    await c.query(`INSERT INTO task_events(task_id, generation, kind, step, payload) VALUES ($1,$2,'step_done',$3,$4)`,
      [id, gen, step, JSON.stringify(patch.payload ?? null)]);
    await c.query(`UPDATE tasks SET current_step = $2, status = COALESCE($3, status),
                     result = COALESCE($4, result), updated_at = clock_timestamp() WHERE id = $1`,
      [id, step, patch.status ?? null, patch.result === undefined ? null : JSON.stringify(patch.result)]);
  });
}

export async function bump(q: Pool | PoolClient, id: string, name: string) {
  await q.query(`INSERT INTO side_effects(task_id, name, count) VALUES ($1,$2,1)
                 ON CONFLICT (task_id, name) DO UPDATE SET count = side_effects.count + 1`, [id, name]);
}

export async function counters(pool: Pool, id: string): Promise<Record<string, number>> {
  const r = await pool.query(`SELECT name, count FROM side_effects WHERE task_id = $1`, [id]);
  return Object.fromEntries(r.rows.map(x => [x.name, x.count]));
}
