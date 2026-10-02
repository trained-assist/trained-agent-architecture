// The 5-step pilot plan. Depends only on StepCtx + TaskStore (no engine API).
// Cloud-smoke hooks (issue #87 A1, all optional, default behaviour = local pilot run.sh):
//   crashRunOnce     -> an extra step between "run" and the wait that throws on attempt 1,
//                       so the platform must resume the instance on its own (no external trigger).
//   waitForTimeoutSec-> short wait deadline: proves the wait timeout fires with no event sent.
//   PILOT_VERSION    -> recorded in step payloads: proves which deployed code a resumed instance ran.
import type { StepCtx } from './port';
import { TaskStore, FencedError, TerminalStateError } from './taskstore';
import { PILOT_VERSION } from './version';

export interface PlanParams {
  taskId: string;
  generation: number;
  pauseAfterRunSec?: number;
  crashRunOnce?: boolean;
  waitForTimeoutSec?: number;
}

/**
 * A deadline fired only when `step.waitForEvent` reports its own timeout; any other error
 * (engine failure, eviction, termination) is NOT a user-reply timeout and must not be
 * recorded as one (issue #90). Known shape: name `WorkflowTimeoutError`, message
 * `Execution timed out after <ms>ms` (miniflare source; recorded verbatim in the event payload
 * so the cloud run keeps the evidence for the real platform's wording).
 */
export function isWaitTimeoutError(e: unknown): boolean {
  const err = e as { name?: string; message?: string };
  if (err?.name === 'WorkflowTimeoutError') return true;
  return /execution timed out after \d+ms|wait(ed)? (event )?timed out|timed out after \d+ms/i.test(String(err?.message ?? ''));
}

/**
 * The plan's wait-failure write, shared by the live plan and the reproduction endpoint
 * `POST /late-wait-timeout` (run.sh T9): a write arriving after the task is terminal must be
 * rejected by TaskStore and only leave an audit row, never touch status/result.
 */
export async function recordWaitFailure(
  store: TaskStore,
  p: PlanParams,
  failure: { kind: 'wait_timeout' | 'wait_error'; reason: string; payload: Record<string, unknown> },
) {
  try {
    await store.commitStep(p.taskId, p.generation, 'wait', {
      status: 'failed',
      kind: failure.kind,
      payload: { ...failure.payload, version: PILOT_VERSION },
      result: { reason: failure.reason },
    });
    return { recorded: true, reason: failure.reason };
  } catch (e) {
    if (e instanceof TerminalStateError) {
      await store.logEvent(p.taskId, `${failure.kind}_ignored`, 'wait', {
        reason: failure.reason,
        detail: String((e as Error).message),
        version: PILOT_VERSION,
      });
      return { recorded: false, reason: 'terminal', error: String((e as Error).message) };
    }
    throw e;
  }
}

export async function pilotPlan(ctx: StepCtx, store: TaskStore, p: PlanParams) {
  const { taskId, generation: gen } = p;
  await ctx.step('prepare', async () => store.commitStep(taskId, gen, 'prepare', { status: 'running', effect: 'prepare' }));
  await ctx.step('run', async () =>
    store.commitStep(taskId, gen, 'run', { effect: 'run', payload: { external: 'called', version: PILOT_VERSION } }));
  // Cloud smoke: injected executor crash right after step 2 (local pilot killed the process here).
  // Attempt 1 throws before writing anything; the platform must retry and continue unaided.
  if (p.crashRunOnce) {
    await ctx.step(
      'guard-crash',
      async (c) => {
        if ((c?.attempt ?? 1) === 1) throw new Error('injected executor crash between steps (attempt 1)');
        return store.commitStep(taskId, gen, 'guard-crash', {
          payload: { resumedBy: 'platform', attempt: c?.attempt ?? 1, version: PILOT_VERSION },
        });
      },
      { limit: 3, delaySec: 2 },
    );
  }
  // Test hook: a durable pause between step 2 and 3 so the harness can kill -9 "between steps".
  if (p.pauseAfterRunSec) await ctx.sleep('pause-after-run', p.pauseAfterRunSec);
  await ctx.step('mark-awaiting', async () =>
    store.commitStep(taskId, gen, 'wait', {
      status: 'awaiting_input', kind: 'status',
      payload: { waitingFor: 'user_reply', version: PILOT_VERSION },
    }));
  let reply: { answer: string; expectVersion?: string } | undefined;
  const timeoutSec = p.waitForTimeoutSec ?? 24 * 3600;
  try {
    reply = await ctx.waitFor<{ answer: string; expectVersion?: string }>('wait', 'user_reply', timeoutSec);
  } catch (e) {
    // Only the engine's own deadline closes the task as `user_reply_timeout`; every other error
    // from waitForEvent is a different failure and must keep its own reason (issue #90).
    if (isWaitTimeoutError(e)) {
      const r = await recordWaitFailure(store, p, {
        kind: 'wait_timeout',
        reason: 'user_reply_timeout',
        payload: { timeoutSec, error: String((e as Error)?.message ?? e) },
      });
      return { ok: false, reason: r.recorded ? 'user_reply_timeout' : 'late_wait_timeout_ignored' };
    }
    const r = await recordWaitFailure(store, p, {
      kind: 'wait_error',
      reason: 'wait_error',
      payload: { timeoutSec, error: String((e as Error)?.message ?? e), errorName: (e as Error)?.name ?? null },
    });
    return { ok: false, reason: r.recorded ? 'wait_error' : 'late_wait_error_ignored' };
  }
  // Version guard (issue #92): the control plane states which deployed code it expects the
  // woken instance to run. Awaiting instances can only run the code they were loaded with, so
  // old logic must fail loudly (`version_mismatch`) instead of silently producing a result
  // from the pre-deploy version. Check is outside ctx.step: no new step name, no step-order
  // change — the version contract (COMPARISON.md §Выводы.5) stays untouched.
  if (reply?.expectVersion && reply.expectVersion !== PILOT_VERSION) {
    await store.commitStep(taskId, gen, 'wait', {
      status: 'failed',
      kind: 'version_mismatch',
      payload: { expected: reply.expectVersion, actual: PILOT_VERSION, used: reply.answer },
      result: { reason: 'version_mismatch', expected: reply.expectVersion, actual: PILOT_VERSION },
    });
    return { ok: false, reason: 'version_mismatch', expected: reply.expectVersion, actual: PILOT_VERSION };
  }
  await ctx.step('wait-received', async () => store.commitStep(taskId, gen, 'wait', { status: 'running', payload: reply }));
  const applied = await ctx.step('apply', async () =>
    store.commitStep(taskId, gen, 'apply', { effect: 'apply', payload: { used: reply?.answer, version: PILOT_VERSION } })
      .then((at) => ({ at, answer: reply?.answer })),
    { limit: 0, delaySec: 1 });
  await ctx.step('finalize', async () =>
    store.commitStep(taskId, gen, 'finalize', {
      status: 'done',
      result: { answer: applied.answer, ok: applied.answer === 'да', version: PILOT_VERSION },
    }));
  return { ok: true };
}

export { FencedError, TerminalStateError };
