import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFeaturePromotion } from './gate-a.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const realRegistry = JSON.parse(fs.readFileSync(path.join(root, 'scenarios/REGISTRY.json'), 'utf8'));
const clone = (value) => structuredClone(value);

test('validates the canonical registry and unchanged documentation', () => {
  const result = validateFeaturePromotion({ registry: realRegistry });
  assert.deepEqual(result, { changedScenarioIds: [], impactedScenarioIds: [] });
});

test('rejects duplicate IDs', () => {
  const registry = clone(realRegistry);
  registry.scenarios.push(clone(registry.scenarios[0]));
  assert.throws(() => validateFeaturePromotion({ registry }), /duplicate scenario ID/);
});

test('rejects missing specification documents', () => {
  const registry = clone(realRegistry);
  registry.scenarios[0].spec = 'scenarios/not-found.md';
  assert.throws(() => validateFeaturePromotion({ registry }), /missing specification/);
});

test('rejects unknown dependencies and dependency cycles', () => {
  const unknown = clone(realRegistry);
  unknown.scenarios[0].depends_on = ['SC-NOT-REGISTERED'];
  assert.throws(() => validateFeaturePromotion({ registry: unknown }), /unknown dependency/);
  const cycle = clone(realRegistry);
  cycle.scenarios[0].depends_on = [cycle.scenarios[1].id];
  cycle.scenarios[1].depends_on = [cycle.scenarios[0].id];
  assert.throws(() => validateFeaturePromotion({ registry: cycle }), /dependency cycle/);
});

test('requires E2E mapping and linked manifest for a changed scenario', () => {
  assert.throws(() => validateFeaturePromotion({
    registry: realRegistry,
    changedFiles: ['scenarios/interaction/SC-SBX-01-anonymous-test-ingress.md']
  }), /no registered E2E/);
  assert.throws(() => validateFeaturePromotion({
    registry: realRegistry,
    changedFiles: ['scenarios/operations/SC-OPS-QA-01-sandbox-functional-verification.md']
  }), /feature manifest/);
});

test('accepts a mapped changed scenario with a PR-linked manifest', () => {
  const manifestFile = path.join(root, 'features/290/manifest.json');
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, JSON.stringify({
    schema_version: 1,
    feature_issue: 290,
    pull_requests: [
      { repo: 'trained-assist/trained-assist-tg-bot', number: 500, role: 'implementation', required: true, depends_on: [] },
      { repo: 'trained-assist/trained-assist-tg-bot', number: 501, role: 'e2e', required: true, depends_on: ['trained-assist/trained-assist-tg-bot#500'] }
    ],
    coverage_exceptions: [],
    sandbox_acceptance: { evidence_url: null, candidate_revisions: [] }
  }));
  try {
    assert.deepEqual(validateFeaturePromotion({
      registry: realRegistry,
      manifestFiles: ['features/290/manifest.json'],
      changedFiles: ['scenarios/operations/SC-OPS-QA-01-sandbox-functional-verification.md'],
      prBody: 'Closes #290'
    }).changedScenarioIds, ['SC-OPS-QA-01']);
  } finally {
    fs.rmSync(path.join(root, 'features'), { recursive: true, force: true });
  }
});

test('rejects incomplete manifests and cycles', () => {
  const dir = fs.mkdtempSync(path.join(root, 'tools/feature-promotion/.tmp-'));
  const file = path.relative(root, path.join(dir, 'manifest.json'));
  try {
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      schema_version: 1, feature_issue: 290,
      pull_requests: [
        { repo: 'trained-assist/trained-assist-tg-bot', number: 500, role: 'implementation', required: true, depends_on: ['trained-assist/trained-assist-tg-bot#501'] },
        { repo: 'trained-assist/trained-assist-tg-bot', number: 501, role: 'e2e', required: true, depends_on: ['trained-assist/trained-assist-tg-bot#500'] }
      ],
      coverage_exceptions: [],
      sandbox_acceptance: { evidence_url: null, candidate_revisions: [] }
    }));
    assert.throws(() => validateFeaturePromotion({ registry: realRegistry, manifestFiles: [file], prBody: '#290' }), /dependency cycle/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
