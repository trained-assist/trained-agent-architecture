'use strict';
// Workflow Port — Restate adapter (ARCHITECTURE §4.2).
// Two halves:
//  * InstancePort: used INSIDE a workflow definition (step / waitFor / sleep)  -> Restate WorkflowContext
//  * ClientPort:   used by callers (start / signal / cancel / status)          -> Restate ingress + admin HTTP API
const restate = require('@restatedev/restate-sdk');

const WF = 'pilotPlan';

class InstancePort {
  constructor(ctx) { this.ctx = ctx; }
  // Durable step: result journaled by restate; on replay fn is NOT re-run.
  step(name, fn, retryPolicy) { return this.ctx.run(name, fn, retryPolicy ? retryPolicy : undefined); }
  sleep(ms) { return this.ctx.sleep(ms); }
  // Durable promise, keyed by name inside this workflow instance. Resolved-before-await is kept.
  waitFor(eventType, timeoutMs) { return this.ctx.promise(eventType).get().orTimeout(timeoutMs); }
}

// Shared-handler side of signal (runs inside restate).
async function resolveSignal(ctx, { eventType, payload }) {
  const p = ctx.promise(eventType);
  try { await p.resolve(payload); return { accepted: true }; }
  catch (e) { return { accepted: false, reason: String(e.message || e) }; }
}

class ClientPort {
  constructor({ ingress, admin }) { this.ingress = ingress; this.admin = admin; }
  async _json(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, body };
  }
  // Idempotent: workflow key = userTaskId. Second start -> PreviouslyAccepted, same invocation.
  start(userTaskId, definition, input) {
    return this._json(`${this.ingress}/${definition || WF}/${encodeURIComponent(userTaskId)}/run/send`,
      { method: 'POST', body: JSON.stringify(input ?? {}) });
  }
  signal(userTaskId, eventType, payload, { async = false } = {}) {
    return this._json(`${this.ingress}/${WF}/${encodeURIComponent(userTaskId)}/signal${async ? '/send' : ''}`,
      { method: 'POST', body: JSON.stringify({ eventType, payload }) });
  }
  async cancel(invocationId) {
    return this._json(`${this.admin}/invocations/${invocationId}/cancel`, { method: 'PATCH' });
  }
  async query(sql) {
    const r = await this._json(`${this.admin}/query`, { method: 'POST', headers: { accept: 'application/json' }, body: JSON.stringify({ query: sql }) });
    return r.body && r.body.rows ? r.body.rows : r.body;
  }
  // Engine-side status (diagnostics); business status comes from Task Store.
  async status(userTaskId) {
    const rows = await this.query(`SELECT id, status, completion_result, retry_count, journal_size
      FROM sys_invocation WHERE target_service_name='${WF}' AND target_service_key='${userTaskId}' AND target_handler_name='run'`);
    return Array.isArray(rows) ? rows[0] : rows;
  }
  output(userTaskId) { return this._json(`${this.ingress}/restate/workflow/${WF}/${encodeURIComponent(userTaskId)}/output`); }
  attach(userTaskId) { return this._json(`${this.ingress}/restate/workflow/${WF}/${encodeURIComponent(userTaskId)}/attach`); }
}

module.exports = { InstancePort, ClientPort, resolveSignal, WF, restate };
