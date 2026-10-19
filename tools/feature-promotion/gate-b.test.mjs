import test from 'node:test';
import assert from 'node:assert/strict';
import { runGateB } from './gate-b.mjs';

const manifest = (overrides = {}) => ({
  schema_version: 1,
  feature_issue: 290,
  pull_requests: [
    { repo: 'trained-assist/trained-assist-tg-bot', number: 500, role: 'implementation', required: true, depends_on: [] },
    { repo: 'trained-assist/trained-assist-web', number: 600, role: 'e2e', required: true, depends_on: ['trained-assist/trained-assist-tg-bot#500'] }
  ],
  sandbox_acceptance: {
    evidence_url: null,
    candidate_revisions: [
      { repo: 'trained-assist/trained-assist-tg-bot', sha: 'a'.repeat(40) },
      { repo: 'trained-assist/trained-assist-web', sha: 'b'.repeat(40) }
    ]
  },
  ...overrides
});
const architecturePr = {
  state: 'open', draft: false, body: 'Closes #290',
  head: { sha: 'e'.repeat(40) },
  base: { ref: 'main', repo: { full_name: 'trained-assist/trained-agent-architecture' } }
};
const api = (prOverrides = {}, checkOverrides = {}, gateAOverrides = {}) => ({
  getIssue: async () => ({ state: 'open' }),
  getPullRequest: async (repo, number) => ({
    state: 'closed', merged_at: '2026-10-19T12:00:00Z', head: { sha: repo.endsWith('tg-bot') ? 'c'.repeat(40) : 'd'.repeat(40) },
    base: { ref: 'main' }, body: 'Closes #290',
    merge_commit_sha: repo.endsWith('tg-bot') ? 'a'.repeat(40) : 'b'.repeat(40),
    ...prOverrides[`${repo}#${number}`]
  }),
  getCheckRuns: async (_repo, sha) => sha === 'e'.repeat(40)
    ? ({ total_count: 1, check_runs: [{ name: 'feature-promotion / specification-consistency', status: 'completed', conclusion: 'success' }], ...gateAOverrides })
    : ({ total_count: 1, check_runs: [{ name: 'CI', status: 'completed', conclusion: 'success' }], ...checkOverrides }),
  getCommitStatus: async () => ({ statuses: [] }),
  getRequiredChecks: async () => ({ strict: true, checks: [{ context: 'CI', app_id: null }] })
});

test('passes when required PRs are merged, checked on current head SHA, and candidate SHAs match', async () => {
  const result = await runGateB({ manifest: manifest(), architecturePr, github: api() });
  assert.equal(result.state, 'PASS');
  assert.equal(result.pullRequests.length, 2);
});

test('fails closed PRs that were not merged', async () => {
  const github = api({ 'trained-assist/trained-assist-tg-bot#500': { merged_at: null } });
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github }), /closed without merge/);
});

test('fails when required PR membership is absent', async () => {
  await assert.rejects(runGateB({ manifest: manifest({ pull_requests: [] }), architecturePr, github: api() }), /no implementation\/E2E PRs registered/);
});

test('blocks Gate B unless Gate A passed on the current architecture PR SHA', async () => {
  const failed = api({}, {}, { check_runs: [{ name: 'feature-promotion / specification-consistency', status: 'completed', conclusion: 'failure' }] });
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: failed }), /required check failed/);
  const missing = api({}, {}, { check_runs: [{ name: 'other check', status: 'completed', conclusion: 'success' }] });
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: missing }), /required check is missing/);
  const closedIssue = { ...api(), getIssue: async () => ({ state: 'closed' }) };
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: closedIssue }), /Feature issue #290 is missing or closed/);
  const skipped = api({}, {}, { check_runs: [{ name: 'feature-promotion / specification-consistency', status: 'completed', conclusion: 'skipped' }] });
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: skipped }), /must actually succeed/);
});

test('detects closed without merge and missing linked feature issue', async () => {
  const closedUnmerged = api({ 'trained-assist/trained-assist-tg-bot#500': { merged_at: null, state: 'closed' } });
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: closedUnmerged }), /closed without merge/);
  const wrongFeature = api({ 'trained-assist/trained-assist-tg-bot#500': { body: 'Fixes #1' } });
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: wrongFeature }), /does not link feature issue/);
});

test('fails failed, pending, empty or partial CI results on the PR head SHA', async () => {
  const failed = api({}, { check_runs: [{ name: 'CI', status: 'completed', conclusion: 'failure' }] });
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: failed }), /required check failed/);
  const pending = api({}, { check_runs: [{ name: 'CI', status: 'in_progress', conclusion: null }] });
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: pending }), /still running/);
  const partial = api({}, { total_count: 2 });
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: partial }), /partial or malformed/);
  const missing = { ...api(), getCheckRuns: async () => ({ total_count: 0, check_runs: [] }) };
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: missing }), /required check is missing/);
  const noProtection = { ...api(), getRequiredChecks: async () => { throw new Error('HTTP 404 Branch not protected'); } };
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: noProtection }), /branch protection/);
});

test('blocks unavailable APIs and rejects stale candidate revisions', async () => {
  const unavailable = { ...api(), getPullRequest: async () => { throw new Error('HTTP 403 rate limit'); } };
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: unavailable }), /BLOCKED|rate limit/);
  const stale = manifest({ sandbox_acceptance: { evidence_url: null, candidate_revisions: [] } });
  await assert.rejects(runGateB({ manifest: stale, architecturePr, github: api() }), /stale or incomplete/);
});

test('rejects PR dependency cycles and missing dependencies', async () => {
  const cycle = manifest({ pull_requests: [
    { repo: 'trained-assist/trained-assist-tg-bot', number: 500, role: 'implementation', required: true, depends_on: ['trained-assist/trained-assist-web#600'] },
    { repo: 'trained-assist/trained-assist-web', number: 600, role: 'e2e', required: true, depends_on: ['trained-assist/trained-assist-tg-bot#500'] }
  ] });
  await assert.rejects(runGateB({ manifest: cycle, architecturePr, github: api() }), /cycle/);
});

test('does not accept PASS when an API check fails after another repository passed', async () => {
  const partialFailure = { ...api(), getCheckRuns: async (_repo, sha) => sha === 'e'.repeat(40)
    ? { total_count: 1, check_runs: [{ name: 'feature-promotion / specification-consistency', status: 'completed', conclusion: 'success' }] }
    : { total_count: 1, check_runs: [{ name: 'CI', status: 'completed', conclusion: sha.startsWith('c') ? 'success' : 'cancelled' }] } };
  await assert.rejects(runGateB({ manifest: manifest(), architecturePr, github: partialFailure }), /required check failed/);
});
