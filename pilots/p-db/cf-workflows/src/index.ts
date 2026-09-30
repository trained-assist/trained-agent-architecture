import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { TaskStore, FencedError } from './taskstore';
import { CfWorkflowPort, cfStepCtx } from './port';
import { pilotPlan, type PlanParams } from './plan';

interface Env { DB: D1Database; WF: Workflow; VERSION?: string; PILOT_KEY?: string }

export class TaskWorkflow extends WorkflowEntrypoint<Env, PlanParams> {
  async run(event: WorkflowEvent<PlanParams>, step: WorkflowStep) {
    const store = new TaskStore(this.env.DB);
    try {
      // codeVersion is read on every (re)play, so a resumed instance reports the code it finished on.
      return await pilotPlan(cfStepCtx(step), store, { ...event.payload, codeVersion: this.env.VERSION ?? 'local' });
    } catch (e: any) {
      if (e instanceof FencedError || /fenced/.test(String(e?.message))) throw new NonRetryableError(String(e.message));
      throw e;
    }
  }
}

const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x, null, 1), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // Real-account runs (run-cf.sh) set PILOT_KEY: the workers.dev URL is public while the test runs.
    if (env.PILOT_KEY && req.headers.get('x-pilot-key') !== env.PILOT_KEY) return json({ error: 'forbidden' }, 403);
    const store = new TaskStore(env.DB);
    const port = new CfWorkflowPort(env.WF, store);
    const body: any = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const id = body.taskId ?? url.searchParams.get('taskId');
    try {
      switch (url.pathname) {
        case '/init': await store.init(); return json({ ok: true });
        case '/start': return json(await port.start(id, body.input ?? {}));
        case '/signal': return json(await port.signal(id, body.type ?? 'user_reply', body.payload));
        case '/cancel': return json(await port.cancel(id));
        case '/status': return json(await port.status(id));
        case '/recover': return json(await port.recover());
        case '/version': return json({ version: env.VERSION ?? 'local' });
        // T6 helpers: a new attempt owner takes over; a stale executor tries to commit a step.
        case '/bump-generation': return json({ generation: await store.bumpGeneration(id) });
        case '/stale-write':
          try {
            await store.commitStep(id, body.generation, body.step ?? 'apply', { status: 'done', effect: body.step ?? 'apply', result: { stale: true } });
            return json({ rejected: false });
          } catch (e: any) {
            return json({ rejected: true, error: String(e.message) });
          }
        default: return json({ error: 'not found' }, 404);
      }
    } catch (e: any) {
      return json({ error: String(e?.message ?? e) }, 500);
    }
  },
};
