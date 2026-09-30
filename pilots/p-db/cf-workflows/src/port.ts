// Workflow Port (ARCHITECTURE.md 4.2) — Cloudflare Workflows adapter.
// Control side: start / signal / cancel / status.  Execution side: step / sleep / waitFor.
// Plan code (plan.ts) only sees the StepCtx interface, never the CF API.
import type { WorkflowStep } from 'cloudflare:workers';
import { TaskStore } from './taskstore';

export interface StepCtx {
  step<T>(name: string, fn: () => Promise<T>, retry?: { limit: number; delaySec: number }): Promise<T>;
  sleep(name: string, seconds: number): Promise<void>;
  waitFor<T = unknown>(name: string, eventType: string, timeoutSec: number): Promise<T>;
}

export function cfStepCtx(step: WorkflowStep): StepCtx {
  return {
    step: (name, fn, retry = { limit: 2, delaySec: 1 }) =>
      step.do(name, { retries: { limit: retry.limit, delay: `${retry.delaySec} seconds`, backoff: 'constant' } }, fn as any) as any,
    sleep: (name, seconds) => step.sleep(name, `${seconds} seconds`),
    waitFor: async (name, eventType, timeoutSec) => {
      const ev = await step.waitForEvent(name, { type: eventType, timeout: `${timeoutSec} seconds` });
      return ev.payload as any;
    },
  };
}

export class CfWorkflowPort {
  constructor(private wf: Workflow, private store: TaskStore) {}

  /** Idempotent on userTaskId: instance id == userTaskId. */
  async start(userTaskId: string, input: Record<string, unknown>) {
    const created = await this.store.createTask(userTaskId, userTaskId);
    const task = await this.store.getTask(userTaskId);
    try {
      const inst = await this.wf.create({ id: userTaskId, params: { taskId: userTaskId, generation: task.generation, ...input } });
      await this.store.logEvent(userTaskId, 'status', 'start', { instance: inst.id }, task.generation);
      return { instance: inst.id, created: true };
    } catch (e: any) {
      // already exists -> return the same instance
      const inst = await this.wf.get(userTaskId);
      return { instance: inst.id, created: false, note: String(e?.message ?? e), taskRowCreated: created };
    }
  }

  async signal(userTaskId: string, eventType: string, payload: unknown) {
    const t0 = Date.now();
    await this.store.logEvent(userTaskId, 'signal', eventType, payload);
    const inst = await this.wf.get(userTaskId);
    await inst.sendEvent({ type: eventType, payload });
    return { sentAt: t0 };
  }

  async cancel(userTaskId: string) {
    // Task Store first: status=cancelled + generation bump fences any in-flight step.
    const gen = await this.store.bumpGeneration(userTaskId, 'cancelled');
    await this.store.logEvent(userTaskId, 'cancel', null, null, gen ?? null);
    const inst = await this.wf.get(userTaskId);
    await inst.terminate();
    return { generation: gen };
  }

  /**
   * LOCAL-EMULATOR WORKAROUND (on Cloudflare the platform itself re-invokes interrupted instances).
   * The miniflare Workflows engine keeps timers in memory and has no alarm()/boot hook, so after
   * kill -9 an instance that was sleeping / between steps stays "running" forever. Its engine DO
   * does re-run the instance (replaying cached steps) when it receives ANY event while not running.
   * So recovery = for every unfinished task in the Task Store, send a no-op "__wake" event.
   */
  async recover() {
    const out: unknown[] = [];
    for (const t of await this.store.unfinishedTasks()) {
      const inst = await this.wf.get(t.id);
      const before = (await inst.status()).status;
      if (['running', 'waiting', 'queued'].includes(before)) await inst.sendEvent({ type: '__wake', payload: null });
      out.push({ id: t.id, engineStatus: before });
    }
    return out;
  }

  async status(userTaskId: string) {
    const row = await this.store.statusRow(userTaskId);
    let engine: unknown = null;
    try {
      engine = await (await this.wf.get(userTaskId)).status();
    } catch (e: any) {
      engine = { error: String(e?.message ?? e) };
    }
    return { taskStore: row, engine };
  }
}
