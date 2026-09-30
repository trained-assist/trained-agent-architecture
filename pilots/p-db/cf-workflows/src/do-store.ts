// Fallback Task Store backend for real-account runs whose API token has no D1 permission:
// the same SQL runs on a SQLite-backed Durable Object, behind a minimal D1-shaped client, so
// taskstore.ts is unchanged. batch() runs in transactionSync -> atomic, like a D1 batch.
import { DurableObject } from 'cloudflare:workers';

type Q = { sql: string; params: unknown[] };

export class StoreDO extends DurableObject {
  exec(q: Q) {
    const sql = this.ctx.storage.sql;
    const results = sql.exec(q.sql, ...q.params).toArray();
    const changes = (sql.exec('SELECT changes() AS c').one() as any).c as number;
    return { results, meta: { changes } };
  }
  batch(qs: Q[]) {
    return this.ctx.storage.transactionSync(() => qs.map((q) => this.exec(q)));
  }
}

export function doD1(ns: DurableObjectNamespace<StoreDO>): D1Database {
  const stub = () => ns.get(ns.idFromName('taskstore'));
  const stmt = (sql: string, params: unknown[] = []): any => ({
    sql, params,
    bind: (...p: unknown[]) => stmt(sql, p),
    first: async () => ((await stub().exec({ sql, params })).results[0] as any) ?? null,
    run: () => stub().exec({ sql, params }),
    all: () => stub().exec({ sql, params }),
  });
  return { prepare: (sql: string) => stmt(sql), batch: (ss: any[]) => stub().batch(ss.map((s) => ({ sql: s.sql, params: s.params }))) } as any;
}
