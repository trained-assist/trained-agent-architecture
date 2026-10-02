import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { TaskStore, FencedError, TerminalStateError, MissingAnswerError } from './taskstore';
import { CfWorkflowPort, cfStepCtx } from './port';
import { pilotPlan, recordWaitFailure, isWaitTimeoutError, type PlanParams } from './plan';
import { PILOT_VERSION } from './version';
import { PROFILE_ID } from './ids';

interface Env { DB: D1Database; WF: Workflow }

export class TaskWorkflow extends WorkflowEntrypoint<Env, PlanParams> {
  async run(event: WorkflowEvent<PlanParams>, step: WorkflowStep) {
    const store = new TaskStore(this.env.DB);
    try {
      return await pilotPlan(cfStepCtx(step), store, event.payload);
    } catch (e: any) {
      // Terminal-task writes, fenced writes and "woken without a durable answer" must never be
      // retried by the platform (issues #90, #116, INV-02).
      if (e instanceof FencedError || e instanceof TerminalStateError || e instanceof MissingAnswerError ||
          /fenced:|terminal:|no answer to consume/.test(String(e?.message)))
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
    // the answer a user submitted: either body.answer, or body.payload.answer (legacy harness shape)
    const answer = body.answer !== undefined ? body.answer : body.payload?.answer ?? body.payload ?? null;
    const eventType = body.type ?? 'user_reply';
    const expectVersion = body.expectVersion ?? body.payload?.expectVersion ?? null;
    const eventKey = body.eventKey ?? null;
    try {
      switch (url.pathname) {
        case '/init': await store.init(); return json({ ok: true, profileId: PROFILE_ID });
        // Deploy marker readback: how fast the edge serves the code wrangler just uploaded (#92).
        case '/version': return json({ version: PILOT_VERSION, profileId: PROFILE_ID, at: Date.now() });
        case '/start': return json(await port.start(id, body.input ?? {}));
        // #116: durable answer + continuation intent in ONE transaction, then delivery.
        case '/signal':
        case '/answer':
          return json(await port.submit(id, eventType, answer, {
            eventKey,
            expectVersion,
            deliver: body.deliver !== false,
          }));
        // Pending operations: what a host/UI would poll, and the explicit acknowledgement.
        case '/outbox': return json(await port.pendingNotices(id));
        case '/ack-outbox': return json(await port.ackNotice(body.dedupKey));
        // Recovery: replay every undelivered operation. Safe to call repeatedly.
        case '/recover-outbox': return json(await port.recoverOutbox());
        // Test-only: a RAW wake event with an arbitrary payload, bypassing the outbox. Used to prove
        // that the woken instance takes the answer from the Task Store, not from the event (#116).
        case '/wake': {
          const inst = await port.rawWake(id, eventType, body.payload ?? null);
          return json(inst);
        }
        case '/cancel': return json(await port.cancel(id));
        case '/status': return json(await port.status(id));
        case '/recover': return json(await port.recover());
        // Controlled failure points (#116): arm/disarm the crash windows.
        case '/fault': {
          if (body.clear) return json({ cleared: (await store.clearFaults()).meta.changes });
          return json(await store.setFault(body.name ?? 'after_commit', body.value ?? 'on'));
        }
        // T6 helpers: a new attempt owner takes over; a stale executor tries to commit a step.
        case '/bump-generation': return json({ generation: await store.bumpGeneration(id) });
        case '/stale-write':
          try {
            await store.commitStep(id, body.generation, body.step ?? 'apply', { status: 'done', effect: body.step ?? 'apply', result: { stale: true } });
            return json({ rejected: false });
          } catch (e: any) {
            return json({ rejected: true, error: String(e.message) });
          }
        // T9 (issue #90): the plan's late wait-failure write, replayed against a terminal task.
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