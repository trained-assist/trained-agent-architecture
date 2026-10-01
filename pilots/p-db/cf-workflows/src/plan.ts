// The 5-step pilot plan. Depends only on StepCtx + TaskStore (no engine API).
// Cloud-smoke hooks (issue #87 A1, all optional, default behaviour = local pilot run.sh):
//   crashRunOnce     -> an extra step between "run" and the wait that throws on attempt 1,
//                       so the platform must resume the instance on its own (no external trigger).
//   waitForTimeoutSec-> short wait deadline: proves the wait timeout fires with no event sent.
//   PILOT_VERSION    -> recorded in step payloads: proves which deployed code a resumed instance ran.
import type { StepCtx } from './port';
import { TaskStore, FencedError } from './taskstore';
import { PILOT_VERSION } from './version';

export interface PlanParams {
  taskId: string;
  generation: number;
  pauseAfterRunSec?: number;
  crashRunOnce?: boolean;
  waitForTimeoutSec?: number;
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
  let reply: { answer: string } | undefined;
  try {
    reply = await ctx.waitFor<{ answer: string }>('wait', 'user_reply', p.waitForTimeoutSec ?? 24 * 3600);
  } catch (e) {
    // Wait deadline passed with no event: finish the task explicitly instead of failing the instance.
    await store.commitStep(taskId, gen, 'wait', {
      status: 'failed', kind: 'wait_timeout',
      payload: { timeoutSec: p.waitForTimeoutSec ?? 24 * 3600, version: PILOT_VERSION },
      result: { reason: 'user_reply_timeout' },
    });
    return { ok: false, reason: 'user_reply_timeout' };
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

export { FencedError };
