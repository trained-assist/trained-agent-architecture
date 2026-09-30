// The 5-step pilot plan. Depends only on StepCtx + TaskStore (no engine API).
import type { StepCtx } from './port';
import { TaskStore, FencedError } from './taskstore';

export interface PlanParams { taskId: string; generation: number; pauseAfterRunSec?: number }

export async function pilotPlan(ctx: StepCtx, store: TaskStore, p: PlanParams) {
  const { taskId, generation: gen } = p;
  await ctx.step('prepare', async () => store.commitStep(taskId, gen, 'prepare', { status: 'running', effect: 'prepare' }));
  await ctx.step('run', async () => store.commitStep(taskId, gen, 'run', { effect: 'run', payload: { external: 'called' } }));
  // Test hook: a durable pause between step 2 and 3 so the harness can kill -9 "between steps".
  if (p.pauseAfterRunSec) await ctx.sleep('pause-after-run', p.pauseAfterRunSec);
  await ctx.step('mark-awaiting', async () =>
    store.commitStep(taskId, gen, 'wait', { status: 'awaiting_input', kind: 'status', payload: { waitingFor: 'user_reply' } }));
  const reply = await ctx.waitFor<{ answer: string }>('wait', 'user_reply', 24 * 3600);
  await ctx.step('wait-received', async () => store.commitStep(taskId, gen, 'wait', { status: 'running', payload: reply }));
  const applied = await ctx.step('apply', async () =>
    store.commitStep(taskId, gen, 'apply', { effect: 'apply', payload: { used: reply?.answer } }).then((at) => ({ at, answer: reply?.answer })),
    { limit: 0, delaySec: 1 });
  await ctx.step('finalize', async () =>
    store.commitStep(taskId, gen, 'finalize', { status: 'done', result: { answer: applied.answer, ok: applied.answer === 'да' } }));
  return { ok: true };
}

export { FencedError };
