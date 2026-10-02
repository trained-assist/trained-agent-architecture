// Workflow Port (ARCHITECTURE.md 4.2) — Cloudflare Workflows adapter.
// Control side: start / submit(answer) / deliver / recoverOutbox / cancel / status.
// Execution side: step / sleep / waitFor.
// Plan code (plan.ts) only sees the StepCtx interface, never the CF API.
//
// Issue #116: `signal` is a WAKE-UP, not the answer. The answer is committed to D1 first
// (atomically with its continuation intent), and delivery is a pending operation that is
// replayed until it lands. Delivery is at-least-once; planning is exactly-once per dedup_key.
import type { WorkflowStep } from 'cloudflare:workers';
import { TaskStore } from './taskstore';
import { PROFILE_ID, logCtx } from './ids';

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
      await this.store.logEvent(userTaskId, 'status', 'start', logCtx(userTaskId, task.generation, { instance: inst.id }), task.generation);
      return { instance: inst.id, created: true };
    } catch (e: any) {
      // already exists -> return the same instance
      const inst = await this.wf.get(userTaskId);
      return { instance: inst.id, created: false, note: String(e?.message ?? e), taskRowCreated: created };
    }
  }

  /**
   * Requirement (2) of #116: the answer is committed to D1 together with the continuation intent,
   * and only THEN is the wake delivered. If the process dies in between, `recoverOutbox` replays
   * the pending row — the answer is already durable, so recovery never needs the sender.
   * `deliver:false` skips delivery on purpose (used to reproduce the crash window).
   */
  async submit(userTaskId: string, eventType: string, answer: unknown, opts: { eventKey?: string | null; expectVersion?: string | null; deliver?: boolean } = {}) {
    const t0 = Date.now();
    const res = await this.store.submitAnswer({
      taskId: userTaskId,
      eventType,
      eventKey: opts.eventKey ?? null,
      answer,
      expectVersion: opts.expectVersion ?? null,
    });
    const fault = await this.store.consumeFault('after_commit');
    if (fault && res.accepted) {
      await this.store.logEvent(
        userTaskId,
        'delivery_skipped',
        'wait',
        logCtx(userTaskId, res.generation, { waitId: res.waitId, eventKey: res.eventKey, reason: 'fault_after_commit' }),
        res.generation,
      );
      return { ...res, delivered: false, delivery: null, fault: 'after_commit', commitMs: Date.now() - t0 };
    }
    if (!res.accepted) return { ...res, delivered: false, delivery: null, commitMs: Date.now() - t0 };
    if (opts.deliver === false) return { ...res, delivered: false, delivery: null, commitMs: Date.now() - t0 };
    const delivery = await this.deliverPending({ taskId: userTaskId, kinds: ['wake'] });
    return { ...res, delivered: delivery.delivered > 0, delivery, commitMs: Date.now() - t0 };
  }

  /** Test-only: raw engine event with an arbitrary payload (bypasses the outbox). */
  async rawWake(userTaskId: string, eventType: string, payload: unknown) {
    const inst = await this.wf.get(userTaskId);
    await inst.sendEvent({ type: eventType, payload });
    return { sent: true, userTaskId, eventType, profileId: PROFILE_ID };
  }

  /**
   * Requirement (3) of #116: deliver every pending operation. `wake` goes to the engine; a
   * `wait_opened` notice is for the host (UI/channel) and is acknowledged explicitly, so an
   * unacked notice stays visible as a pending operation instead of disappearing.
   */
  async deliverPending(filter: { taskId?: string; kinds?: string[]; limit?: number } = {}) {
    const rows = await this.store.pendingOutbox({ limit: filter.limit ?? 20, taskId: filter.taskId, kinds: filter.kinds });
    let delivered = 0;
    let failed = 0;
    const detail: unknown[] = [];
    for (const r of rows) {
      if (r.kind !== 'wake') continue; // host notices are polled + acked by the host
      try {
        const inst = await this.wf.get(r.task_id);
        // payload carries keys only — the answer itself stays in the Task Store (#116)
        await inst.sendEvent({ type: r.event_type, payload: { wake: true, eventKey: r.dedup_key } });
        await this.store.markDelivered(r.id);
        await this.store.logEvent(
          r.task_id,
          'wake_delivered',
          'wait',
          logCtx(r.task_id, 0, { waitId: r.wait_id, dedup_key: r.dedup_key, reason: r.reason, run_id: r.run_id }),
        );
        delivered++;
        detail.push({ id: r.id, kind: r.kind, dedup_key: r.dedup_key, result: 'delivered' });
      } catch (e: any) {
        await this.store.markDeliveryFailed(r.id, String(e?.message ?? e));
        failed++;
        detail.push({ id: r.id, kind: r.kind, dedup_key: r.dedup_key, result: 'failed', error: String(e?.message ?? e) });
      }
    }
    const left = await this.store.pendingOutbox({ limit: 50, taskId: filter.taskId, kinds: filter.kinds });
    return { attempted: rows.length, delivered, failed, remaining: left.length, detail, profileId: PROFILE_ID };
  }

  /** Recovery entry point: replay pending operations for every task (called on start-up in a real control plane). */
  async recoverOutbox() {
    return this.deliverPending({});
  }

  async pendingNotices(taskId: string) {
    return { profileId: PROFILE_ID, outbox: await this.store.outboxRows(taskId) };
  }

  async ackNotice(dedupKey: string) {
    return { acked: await this.store.ackOutbox(dedupKey) };
  }

  async cancel(userTaskId: string) {
    // Task Store first, atomically: status=cancelled, wait -> cancelled, pending operations dropped,
    // generation bump fences any in-flight step AND any late answer (its consume guard fails).
    const out = await this.store.cancelTask(userTaskId);
    const inst = await this.wf.get(userTaskId);
    await inst.terminate();
    return { generation: out.generation, status: out.status };
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
    const durable = await this.store.stateRow(userTaskId);
    let engine: unknown = null;
    try {
      engine = await (await this.wf.get(userTaskId)).status();
    } catch (e: any) {
      engine = { error: String(e?.message ?? e) };
    }
    return { taskStore: row, durable: durable ? { waits: JSON.parse(durable.waits ?? '[]'), outbox: JSON.parse(durable.outbox ?? '[]') } : null, engine };
  }
}