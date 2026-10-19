#!/usr/bin/env node
// Infrastructure probe only: real OpenCode + Ladder + disposable local HTTP E2E.
// It never posts feature acceptance status or pretends Gate A/B were satisfied.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute, MODEL } from './gate-c.mjs';

const output = path.resolve(process.env.GATE_C_OUTPUT ?? 'gate-c-artifacts');
fs.mkdirSync(output, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-c-probe-'));
fs.mkdirSync(path.join(work, 'acceptance/probe'), { recursive: true });
fs.writeFileSync(path.join(work, 'acceptance/probe/http-e2e.mjs'), `
import http from 'node:http';
import assert from 'node:assert/strict';
const server = http.createServer((req, res) => {
  res.writeHead(req.url === '/health' ? 200 : 404, {'content-type':'application/json'});
  res.end(JSON.stringify(req.url === '/health' ? {status:'ok'} : {error:'not_found'}));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const base = 'http://127.0.0.1:' + server.address().port;
  for (let i=0; i<3; i++) {
    const r = await fetch(base+'/health');
    assert.equal(r.status,200); assert.deepEqual(await r.json(),{status:'ok'});
    console.log('request '+(i+1)+': HTTP 200, body status=ok');
  }
  const missing = await fetch(base+'/missing');
  assert.equal(missing.status,404); assert.deepEqual(await missing.json(),{error:'not_found'});
  console.log('unknown route: HTTP 404, body error=not_found');
} finally { await new Promise(resolve => server.close(resolve)); console.log('cleanup: server closed'); }
`);
const context = {
  mode: 'infrastructure-probe', target: { environment: 'local' },
  revisions: [{ repo: 'acceptance/probe', sha: process.env.GITHUB_SHA ?? 'local-working-tree' }],
  contract: 'Disposable local Node HTTP fixture. No external services or credentials. Run node http-e2e.mjs from acceptance/probe. It owns an ephemeral localhost port and closes its server in finally. This proves the acceptance adapter, not a product feature or staging.',
  scenarios: [{ id: 'GATE-C-INFRA-PROBE', spec: 'inline', owner: 'acceptance/probe', depends_on: [], component_tests: [],
    specification: 'Three consecutive GET /health requests return HTTP 200 and JSON status ok. Unknown route returns 404 and error not_found. Server is closed after the test.',
    e2e_tests: [{ repo: 'acceptance/probe', path: 'http-e2e.mjs', kind: 'test' }] }],
};
try {
  if (!process.env.LLM_LADDER_TOKEN) throw new Error('Main LLM_LADDER_TOKEN is unavailable');
  const result = { mode: context.mode, model: MODEL, ...await execute(context, work, output) };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(result, null, 2));
  console.log(`Gate C infrastructure probe: ${result.state}; model=${MODEL}; target=local`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Gate C infrastructure probe: **${result.state}**, model **${MODEL}**, target **local**. This is not feature acceptance.\n`);
  if (result.state !== 'PASS') process.exitCode = 1;
} catch (e) {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ mode: context.mode, state: 'BLOCKED', reason: e.message }));
  console.error(e.message); process.exitCode = 1;
} finally { fs.rmSync(work, { recursive: true, force: true }); }
