// The 5-step pilot plan. Depends only on the Port (step/waitFor) + Task Store.
import { DBOS } from '@dbos-inc/dbos-sdk';
import { Pool } from 'pg';
import { step, waitFor, WORKFLOW } from './port';
import { claim, fencedStep, bump } from './taskstore';

const log = (...a: unknown[]) => console.log(new Date().toISOString(), `[exec ${process.pid}]`, ...a);

export function definePlan(pool: Pool) {
  async function plan(taskId: string, _input: unknown) {
    // Not a step: runs on every (re)entry => a new attempt generation per executor attempt.
    const gen = await claim(pool, taskId, `pid:${process.pid}`);
    if (gen === null) { log(taskId, 'claim refused (terminal)'); return { skipped: true }; }
    log(taskId, 'attempt generation', gen);

    await step('prepare', async () => {
      await fencedStep(pool, taskId, gen, 'prepare', { status: 'running' }, c => bump(c, taskId, 'prepare'));
      log(taskId, 'step1 prepare executed');
    });
    await step('run', async () => {
      await bump(pool, taskId, 'run');                       // "external call" (non-transactional)
      await fencedStep(pool, taskId, gen, 'run', { payload: { external: 'ok' } });
      log(taskId, 'step2 run executed');
    });
    if (process.env.CRASH_AFTER_STEP === 'run' && process.env.CRASH_TASK === taskId) {
      log(taskId, 'CRASH: kill -9 self after step 2, before step 3');
      process.kill(process.pid, 'SIGKILL');
      await new Promise(() => {});
    }
    await step('wait', async () => {
      await fencedStep(pool, taskId, gen, 'wait', { status: 'awaiting_input' });
      log(taskId, 'step3 awaiting_input');
    });
    const reply = await waitFor<{ answer: string }>('user_reply', 24 * 3600);
    log(taskId, 'waitFor returned', JSON.stringify(reply));
    if (!reply) {
      await step('timeout', () => fencedStep(pool, taskId, gen, 'timeout', { status: 'failed' }));
      return { timeout: true };
    }
    await step('apply', async () => {
      await fencedStep(pool, taskId, gen, 'apply', { status: 'running', payload: reply },
        c => bump(c, taskId, 'apply'));
      log(taskId, 'step4 apply executed with', JSON.stringify(reply));
    });
    await step('finalize', async () => {
      await fencedStep(pool, taskId, gen, 'finalize', { status: 'done', result: { answer: reply.answer } });
      log(taskId, 'step5 finalize -> done');
    });
    return { answer: reply.answer };
  }
  return DBOS.registerWorkflow(plan, { name: WORKFLOW });
}
