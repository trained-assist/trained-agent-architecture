'use strict';
// Executor = Restate SDK endpoint process. Holds no durable state; can be kill -9'd at any time.
// SDK 1.17.x uses Promise.withResolvers (Node >= 22). Node 20 on this VM -> 3-line polyfill.
if (!Promise.withResolvers) Promise.withResolvers = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const fs = require('fs');
const { InstancePort, resolveSignal, WF, restate } = require('./port');
const { TaskStore } = require('./taskstore');

const PORT = Number(process.env.SERVICE_PORT || 19080);
const store = new TaskStore(process.env.TASK_DB || 'taskstore.db');
const OWNER = `pid:${process.pid}`;
const log = (...a) => console.log(new Date().toISOString(), `[svc ${process.pid}]`, ...a);
const DAY = 24 * 3600 * 1000;

// Fault injection: kill -9 self right after step <name> of task <id> completed (once, marker file).
function maybeCrash(id, step) {
  const spec = process.env.CRASH_AFTER; // "<taskId>:<step>"
  if (!spec || spec !== `${id}:${step}`) return;
  const marker = `${process.env.CRASH_MARKER_DIR || '.'}/crash-${id}-${step}.done`;
  if (fs.existsSync(marker)) return;
  fs.writeFileSync(marker, String(Date.now()));
  log(`CRASH INJECTION: kill -9 self after step '${step}' of ${id}`);
  process.kill(process.pid, 'SIGKILL');
}

// Fenced step: journaled by restate (ctx.run) + committed in Task Store under current generation.
async function fencedStep(port, id, gen, name, opts) {
  return port.step(name, async () => {
    if (opts.work) await opts.work();
    const r = store.commitStep(id, gen, name, opts);
    if (!r.ok) { store.recordRejected(id, gen, name, r.reason); throw new restate.TerminalError(`fenced: ${r.reason}`); }
    log(`step ${name} committed gen=${gen}`);
    return opts.ret ?? true;
  });
}

const pilotPlan = restate.workflow({
  name: WF,
  handlers: {
    run: async (ctx, input = {}) => {
      const id = ctx.key;
      const port = new InstancePort(ctx);
      // Each (re)execution of the handler = new attempt -> new generation (not journaled on purpose).
      const gen = store.claimGeneration(id, OWNER);
      log(`attempt start ${id} gen=${gen} invocation=${ctx.request().id}`);
      try {
        await fencedStep(port, id, gen, 'prepare', { sideEffect: 'prepare', status: 'running' });
        maybeCrash(id, 'prepare');
        await fencedStep(port, id, gen, 'run', {
          sideEffect: 'run',
          work: input.runDelayMs ? () => new Promise(r => setTimeout(r, input.runDelayMs)) : null,
        });
        maybeCrash(id, 'run');
        await fencedStep(port, id, gen, 'wait', { status: 'awaiting_input', payload: { waitingFor: 'user_reply' } });
        const reply = await port.waitFor('user_reply', input.waitTimeoutMs || DAY);
        log(`user_reply received ${JSON.stringify(reply)}`);
        await port.step('signal_received_at', async () => { store.event(id, 'signal', 'wait', gen, reply); return Date.now(); });
        await fencedStep(port, id, gen, 'apply', { sideEffect: 'apply', status: 'running', payload: { answer: reply && reply.answer } });
        const result = { answer: reply && reply.answer, applied: true };
        await fencedStep(port, id, gen, 'finalize', { status: 'done', result });
        return result;
      } catch (e) {
        if (e instanceof restate.TerminalError && e.code === 409) { // cancelled (INV-08)
          await port.step('mark_cancelled', async () => { store.commitStep(id, gen, null, { status: 'cancelled' }); return true; });
          log(`cancelled ${id}`);
        }
        throw e;
      }
    },
    signal: async (ctx, req) => {
      const r = await resolveSignal(ctx, req);
      log(`signal ${req.eventType} for ${ctx.key}: ${JSON.stringify(r)}`);
      return r;
    },
  },
  options: { inactivityTimeout: 1000 }, // suspend quickly when blocked on waitFor (frees the executor)
});

restate.serve({ services: [pilotPlan], port: PORT }).then(p => log(`listening on ${p}`));
