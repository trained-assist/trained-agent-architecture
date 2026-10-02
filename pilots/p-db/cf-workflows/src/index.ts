import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { TaskStore, FencedError, TerminalStateError } from './taskstore';
import { CfWorkflowPort, cfStepCtx } from './port';
import { pilotPlan, recordWaitFailure, isWaitTimeoutError, type PlanParams } from './plan';
import { PILOT_VERSION } from './version';

interface Env { DB: D1Database; WF: Workflow }

export class TaskWorkflow extends WorkflowEntrypoint<Env, PlanParams> {
  async run(event: WorkflowEvent<PlanParams>, step: WorkflowStep) {
    const store = new TaskStore(this.env.DB);
    try {
      return await pilotPlan(cfStepCtx(step), store, event.payload);
    } catch (e: any) {
      // Terminal-task writes and fenced writes must never be retried by the platform (issues #90, INV-02).
      if (e instanceof FencedError || e instanceof TerminalStateError || /fenced:|terminal:/.test(String(e?.message)))
        throw new NonRetryableError(String(e.message));
      throw e;
    }
  }
}

const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x, null, 1), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const store = new TaskStore(env.DB);
    const port = new CfWorkflowPort(env.WF, store);
    const body: any = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const id = body.taskId ?? url.searchParams.get('taskId');
    try {
      switch (url.pathname) {
        case '/init': await store.init(); return json({ ok: true });
        // Deploy marker readback: polls how fast the edge serves the code wrangler just
        // uploaded (issue #92 propagation measurement; no steps, no Task Store writes).
        case '/version': return json({ version: PILOT_VERSION, at: Date.now() });
        case '/start': return json(await port.start(id, body.input ?? {}));
        case '/signal': return json(await port.signal(id, body.type ?? 'user_reply', body.payload, { prewarm: body.prewarm !== false }));
        case '/cancel': return json(await port.cancel(id));
        case '/status': return json(await port.status(id));
        case '/recover': return json(await port.recover());
        // T6 helpers: a new attempt owner takes over; a stale executor tries to commit a step.
        case '/bump-generation': return json({ generation: await store.bumpGeneration(id) });
        case '/stale-write':
          try {
            await store.commitStep(id, body.generation, body.step ?? 'apply', { status: 'done', effect: body.step ?? 'apply', result: { stale: true } });
            return json({ rejected: false });
          } catch (e: any) {
            return json({ rejected: true, error: String(e.message) });
          }
        // T9 (issue #90): the plan's late wait-failure write, replayed against a task that is
        // already terminal — same generation as the live attempt, exactly the failing case.
        case '/late-wait-timeout': {
          const task = await store.getTask(id);
          const p: PlanParams = { taskId: id, generation: body.generation ?? task?.generation ?? 1 };
          const r = await recordWaitFailure(store, p, {
            kind: 'wait_timeout',
            reason: 'user_reply_timeout',
            payload: { timeoutSec: body.timeoutSec ?? 86400, late: true },
          });
          return json({ ...r, generation: p.generation });
        }
        // T9b: which reason the plan's catch would write for a given waitForEvent error.
        case '/classify-wait-error':
          return json({ isTimeout: isWaitTimeoutError({ name: body.name, message: body.message }) });
        default: return json({ error: 'not found' }, 404);
      }
    } catch (e: any) {
      return json({ error: String(e?.message ?? e) }, 500);
    }
  },
};
