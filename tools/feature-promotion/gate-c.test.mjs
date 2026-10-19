import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODEL, opencodeConfig, affectedScenarios, validatePlan, evaluate, parseAgentOutput, execute } from './gate-c.mjs';

const scenario = (id, depends_on = []) => ({ id, spec: `${id}.md`, depends_on, component_tests: [], e2e_tests: [{ repo: 'org/code', path: 'e2e.mjs', kind: 'test' }] });
const context = { revisions: [{ repo: 'org/code', sha: 'a'.repeat(40) }], scenarios: [scenario('A')] };
const probe = { id: 'http', repo: 'org/code', cwd: '.', argv: ['node', 'e2e.mjs'], kind: 'e2e', test_ref: 'e2e.mjs', scenarios: ['A'], assertion: 'HTTP response body matches scenario' };
const review = { semantic: 'PASS', cleanup: 'PASS', reason: 'Observed expected HTTP body and cleanup', scenarios: [{ id: 'A', result: 'PASS', reason: 'Observable HTTP assertion passed', probe_ids: ['http'] }] };
const receipt = { ...probe, exitCode: 0, logSha256: 'digest' };

test('build/default routes both models through Ladder without embedding a key', () => {
  const c = opencodeConfig();
  assert.equal(MODEL, 'ladder/build'); assert.equal(c.small_model, MODEL);
  assert.equal(c.provider.ladder.options.apiKey, '{env:LLM_LADDER_TOKEN}');
});
test('selects changed scenario and transitive dependent regression scenarios', () => {
  const r = { scenarios: [scenario('A'), scenario('B', ['A']), scenario('C', ['B']), scenario('D')] };
  assert.deepEqual(affectedScenarios(r, ['A.md']).map((s) => s.id), ['A', 'B', 'C']);
});
test('rejects unmapped tests, escaping cwd, missing regression E2E and duplicate probes', () => {
  assert.deepEqual(validatePlan({ probes: [probe] }, context).probes, [probe]);
  for (const bad of [{ ...probe, cwd: '../escape' }, { ...probe, test_ref: 'invented.mjs' }, { ...probe, scenarios: ['unknown'] }]) {
    assert.throws(() => validatePlan({ probes: [bad] }, context));
  }
  assert.throws(() => validatePlan({ probes: [probe, probe] }, context), /duplicate/);
  assert.throws(() => validatePlan({ probes: [probe] }, { ...context, scenarios: [scenario('A'), scenario('B')] }), /No executable E2E/);
});
test('an LLM PASS cannot override failed execution or missing evidence/cleanup', () => {
  assert.equal(evaluate(review, [receipt], context), 'PASS');
  assert.equal(evaluate(review, [{ ...receipt, exitCode: 1 }], context), 'FAIL');
  assert.equal(evaluate(review, [{ ...receipt, exitCode: null }], context), 'FAIL');
  assert.equal(evaluate({ ...review, cleanup: 'UNCLEAR' }, [receipt], context), 'UNCLEAR');
  assert.equal(evaluate({ ...review, scenarios: [] }, [receipt], context), 'UNCLEAR');
  assert.equal(evaluate(review, [], context), 'FAIL');
});
test('agent output must contain structured text; a diagnostic PASS is not accepted', () => {
  assert.deepEqual(parseAgentOutput(JSON.stringify({ type: 'text', part: { text: '{"probes":[]}' } })), { probes: [] });
  assert.throws(() => parseAgentOutput('PASS\n{"type":"error"}'));
});
test('executor records real command status and rejects source modification', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-c-test-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-c-out-'));
  fs.mkdirSync(path.join(work, 'org/code'), { recursive: true });
  const source = path.join(work, 'org/code/e2e.mjs');
  fs.writeFileSync(source, 'original');
  const fakeAgent = (_work, _prompt, label) => label === 'plan' ? { probes: [probe] } : review;
  try {
    const result = await execute(context, work, out, fakeAgent, () => ({ status: 1, stdout: 'assertion failed' }));
    assert.equal(result.state, 'FAIL');
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'receipts.json')))[0].exitCode, 1);
    await assert.rejects(execute(context, work, out, fakeAgent, () => {
      fs.writeFileSync(source, 'disabled test'); return { status: 0, stdout: 'PASS' };
    }), /changed pinned source/);
  } finally { fs.rmSync(work, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }); }
});
