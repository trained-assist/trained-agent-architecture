// Workflow Port (ARCHITECTURE.md 4.2) implemented on DBOS Transact.
// Inside-workflow ops (step/waitFor) use the DBOS static API; outside ops
// (start/signal/cancel/status) use DBOSClient, so they work while no executor is alive.
import { DBOS, DBOSClient } from '@dbos-inc/dbos-sdk';
import { Pool } from 'pg';
import { createTask, tx, DB_URL } from './taskstore';

export const QUEUE = 'pilot_tasks';
export const APP = 'p-db-pilot';
export const WORKFLOW = 'pilotPlan';

// ---- inside a workflow ----
export function step<T>(name: string, fn: () => Promise<T>, retry?: { maxAttempts: number }) {
  return DBOS.runStep(fn, { name, ...(retry ? { retriesAllowed: true, maxAttempts: retry.maxAttempts } : {}) });
}
export function waitFor<T>(eventType: string, timeoutSeconds: number) {
  return DBOS.recv<T>(eventType, { timeoutSeconds });
}

// ---- outside (control plane) ----
export class WorkflowPort {
  private constructor(private client: DBOSClient, private pool: Pool) {}
  static async open(pool: Pool) {
    return new WorkflowPort(await DBOSClient.create({ systemDatabaseUrl: DB_URL, applicationName: APP }), pool);
  }
  /** Idempotent: workflowID = userTaskId; a repeat returns the existing instance. */
  async start(userTaskId: string, input: unknown) {
    await createTask(this.pool, userTaskId);
    const h = await this.client.enqueue({ queueName: QUEUE, workflowName: WORKFLOW, workflowID: userTaskId,
      appVersion: 'pilot-v1' }, userTaskId, input);
    return h.workflowID;
  }
  /** Journal the signal in Task Store and persist the DBOS message in ONE Postgres transaction. */
  async signal(instance: string, eventType: string, payload: unknown, idempotencyKey?: string) {
    await tx(this.pool, async c => {
      await c.query(`INSERT INTO task_events(task_id, kind, step, payload) VALUES ($1,'signal',$2,$3)`,
        [instance, eventType, JSON.stringify({ payload, idempotencyKey })]);
      await this.client.sendInTransaction(c, instance, payload, eventType, idempotencyKey);
    });
  }
  /** INV-08: engine cancel + Task Store status + generation bump (fences any in-flight attempt). */
  async cancel(instance: string) {
    await tx(this.pool, async c => {
      await c.query(`UPDATE tasks SET status='cancelled', generation = generation + 1, updated_at = clock_timestamp() WHERE id=$1`, [instance]);
      await c.query(`INSERT INTO task_events(task_id, kind) VALUES ($1,'cancel')`, [instance]);
    });
    await this.client.cancelWorkflow(instance);
  }
  async status(instance: string) {
    const wf = await this.client.getWorkflow(instance);
    const t = (await this.pool.query(`SELECT status, generation, current_step, result FROM tasks WHERE id=$1`, [instance])).rows[0];
    return { engine: wf?.status, task: t };
  }
  get raw() { return this.client; }
  async close() { await this.client.destroy(); }
}
