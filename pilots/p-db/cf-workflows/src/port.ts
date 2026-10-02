// Workflow Port (ARCHITECTURE.md 4.2) — Cloudflare Workflows adapter.
// Control side: start / signal / cancel / status.  Execution side: step / sleep / waitFor.
// Plan code (plan.ts) only sees the StepCtx interface, never the CF API.
import type { WorkflowStep } from 'cloudflare:workers';
import { TaskStore } from './taskstore';

export interface StepAttempt {
  /** 1 on the first try, 2+ on platform retries (cloud smoke crash hook). */
  attempt?: number;
}

export interface StepCtx {
  step<T>(name: string, fn: (attempt?: StepAttempt) => Promise<T>, retry?: { limit: number; delaySec: number }): Promise<T>;
  sleep(name: string, seconds: number): Promise<void>;
  waitFor<T = unknown>(name: string, eventType: string, timeoutSec: number): Promise<T>;
}

export function cfStepCtx(step: WorkflowStep): StepCtx {
  return {
    // Cloudflare passes WorkflowStepContext (with `attempt`) as the first callback argument.
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

  /**
   * Deliver a user signal (issue #91/#92 instrumentation).
   *
   * `prewarm` (default on) forces the instance's Durable Object to answer an RPC *before* the
   * event is handed over. Two effects, both measured and recorded on the `signal` event:
   *   - after `wrangler deploy` the first RPC into the instance is what makes it load the new
   *     script version, so the event lands on an instance that already has the new code (#92);
   *   - the split `prewarmMs` / `sendMs` shows where the post-deploy wake latency of tens of
   *     seconds actually sits (#91).
   * `signal.at` stays the moment the request arrived (before the prewarm) so the harness's
   * signal→apply latency remains end-to-end comparable with the pre-instrumentation runs.
   */
  async signal(userTaskId: string, eventType: string, payload: unknown, opts: { prewarm?: boolean } = {}) {
    const t0 = Date.now();
    const inst = await this.wf.get(userTaskId);
    let prewarmMs: number | null = null;
    let prewarmError: string | null = null;
    if (opts.prewarm !== false) {
      const p0 = Date.now();
      try {
        await inst.status();
      } catch (e: any) {
        prewarmError = String(e?.message ?? e);
      }
      prewarmMs = Date.now() - p0;
    }
    const s0 = Date.now();
    await inst.sendEvent({ type: eventType, payload });
    const sendMs = Date.now() - s0;
    const timing = { prewarmMs, sendMs, deliveryMs: Date.now() - t0 };
    const logged = payload && typeof payload === 'object' ? { ...(payload as object), __timing: timing } : { value: payload, __timing: timing };
    await this.store.logEvent(userTaskId, 'signal', eventType, logged, null, t0);
    return { sentAt: t0, ...timing, prewarmError };
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
