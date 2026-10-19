#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fail = (message) => { throw new Error(message); };
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

function safeRepoPath(value, context) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value) || value.split('/').includes('..')) {
    fail(`${context}: expected a repository-relative path`);
  }
}

function assertAcyclic(nodes, edges, context) {
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail(`${context}: dependency cycle includes ${id}`);
    if (visited.has(id)) return;
    if (!nodes.has(id)) fail(`${context}: unknown dependency ${id}`);
    visiting.add(id);
    for (const next of edges.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of nodes) visit(id);
}

function validateRegistry(registry) {
  if (!registry || registry.version !== 1 || !Array.isArray(registry.scenarios)) fail('registry: expected version 1 and scenarios[]');
  const ids = new Set();
  const edges = new Map();
  const bySpec = new Map();
  for (const entry of registry.scenarios) {
    if (!entry || typeof entry.id !== 'string' || !/^[A-Z][A-Z0-9-]+$/.test(entry.id)) fail('registry: invalid scenario ID');
    if (ids.has(entry.id)) fail(`registry: duplicate scenario ID ${entry.id}`);
    ids.add(entry.id);
    safeRepoPath(entry.spec, `${entry.id}.spec`);
    if (!fs.existsSync(path.join(ROOT, entry.spec))) fail(`${entry.id}: missing specification ${entry.spec}`);
    if (bySpec.has(entry.spec)) fail(`registry: specification is registered more than once: ${entry.spec}`);
    if (typeof entry.owner !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.owner)) fail(`${entry.id}: invalid owner repository`);
    if (!Array.isArray(entry.depends_on) || !Array.isArray(entry.e2e_tests) || !Array.isArray(entry.component_tests)) fail(`${entry.id}: depends_on, component_tests, and e2e_tests must be arrays`);
    if (new Set(entry.depends_on).size !== entry.depends_on.length) fail(`${entry.id}: duplicate scenario dependency`);
    const testRefs = new Set();
    for (const test of [...entry.component_tests, ...entry.e2e_tests]) {
      if (!test || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(test.repo) || typeof test.path !== 'string' || test.path.startsWith('/') || test.path.split('/').includes('..')) {
        fail(`${entry.id}: invalid test reference`);
      }
      if (entry.e2e_tests.includes(test) && !['test', 'sandbox-workflow'].includes(test.kind)) fail(`${entry.id}: E2E reference needs kind test or sandbox-workflow`);
      const ref = `${test.repo}:${test.path}`;
      if (testRefs.has(ref)) fail(`${entry.id}: duplicate E2E reference ${ref}`);
      testRefs.add(ref);
    }
    edges.set(entry.id, entry.depends_on);
    bySpec.set(entry.spec, entry.id);
  }
  assertAcyclic(ids, edges, 'registry');
  return { ids, edges, bySpec };
}

function validateManifest(file, body) {
  const manifest = readJson(file);
  const topLevel = new Set(['schema_version', 'feature_issue', 'pull_requests', 'coverage_exceptions', 'sandbox_acceptance']);
  if (Object.keys(manifest).some((key) => !topLevel.has(key))) fail(`${file}: unknown manifest field`);
  if (manifest.schema_version !== 1 || !Number.isInteger(manifest.feature_issue) || manifest.feature_issue < 1) fail(`${file}: invalid schema_version or feature_issue`);
  if (!Array.isArray(manifest.pull_requests) || !Array.isArray(manifest.coverage_exceptions)) fail(`${file}: pull_requests and coverage_exceptions arrays are required`);
  if (!manifest.sandbox_acceptance || !Object.hasOwn(manifest.sandbox_acceptance, 'evidence_url') || !Array.isArray(manifest.sandbox_acceptance.candidate_revisions)) fail(`${file}: sandbox_acceptance is incomplete`);
  const target = manifest.sandbox_acceptance.target;
  if (target !== undefined) {
    if (!target || !['local', 'dev', 'test', 'staging'].includes(target.environment) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target.contract?.repo)) fail(`${file}: invalid sandbox target/contract`);
    safeRepoPath(target.contract?.path, `${file}: sandbox contract`);
  }
  if (manifest.sandbox_acceptance.evidence_url !== null && !/^https:\/\//.test(manifest.sandbox_acceptance.evidence_url)) fail(`${file}: evidence_url must be https or null`);
  const revisionKeys = new Set();
  for (const revision of manifest.sandbox_acceptance.candidate_revisions) {
    if (!revision || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(revision.repo) || !/^[a-f0-9]{40}$/.test(revision.sha)) fail(`${file}: invalid sandbox tested revision`);
    const key = `${revision.repo}@${revision.sha}`;
    if (revisionKeys.has(key)) fail(`${file}: duplicate sandbox tested revision ${key}`);
    revisionKeys.add(key);
  }
  if (manifest.sandbox_acceptance.evidence_url !== null && revisionKeys.size === 0) fail(`${file}: sandbox evidence requires pinned candidate revisions`);
  const refs = new Set();
  const edges = new Map();
  for (const item of manifest.pull_requests) {
    if (!item || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.repo) || !Number.isInteger(item.number) || item.number < 1 || !['implementation', 'e2e'].includes(item.role) || typeof item.required !== 'boolean' || !Array.isArray(item.depends_on)) fail(`${file}: invalid pull request membership`);
    const ref = `${item.repo}#${item.number}`;
    if (refs.has(ref)) fail(`${file}: duplicate work item ${ref}`);
    refs.add(ref);
    edges.set(ref, item.depends_on);
  }
  assertAcyclic(refs, edges, file);
  for (const exception of manifest.coverage_exceptions) {
    if (!exception || typeof exception.scenario_id !== 'string' || typeof exception.reason !== 'string' || exception.reason.trim().length < 20 || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*$/.test(exception.tracking_issue)) fail(`${file}: invalid coverage exception`);
  }
  const exceptionIds = new Set(manifest.coverage_exceptions.map((exception) => exception.scenario_id));
  if (exceptionIds.size !== manifest.coverage_exceptions.length) fail(`${file}: duplicate coverage exception scenario`);
  if (body && !new RegExp(`(?:#${manifest.feature_issue}\\b|issues/${manifest.feature_issue}\\b)`).test(body)) fail(`${file}: feature issue #${manifest.feature_issue} is not linked from the architecture PR`);
  return manifest;
}

function apiJson(endpoint) {
  const result = spawnSync('gh', ['api', endpoint], { cwd: ROOT, encoding: 'utf8', env: process.env });
  if (result.error || result.status !== 0) {
    const reason = (result.stderr || result.error?.message || `gh exited ${result.status}`).trim().replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(reason);
  }
  try { return JSON.parse(result.stdout); }
  catch { throw new Error('GitHub API returned invalid JSON'); }
}

function verifyExternalReferences(registry, manifestFiles, repository) {
  const defaultBranches = new Map();
  for (const entry of registry.scenarios) {
    for (const ref of [...entry.component_tests, ...entry.e2e_tests]) {
      if (!defaultBranches.has(ref.repo)) {
        try {
          const info = apiJson(`repos/${ref.repo}`);
          if (!info.default_branch) throw new Error('repository response has no default branch');
          defaultBranches.set(ref.repo, info.default_branch);
        } catch (error) {
          throw new Error(`BLOCKED: cannot read E2E repository ${ref.repo} (${error.message})`);
        }
      }
      const encodedPath = ref.path.split('/').map(encodeURIComponent).join('/');
      const branch = encodeURIComponent(defaultBranches.get(ref.repo));
      try { apiJson(`repos/${ref.repo}/contents/${encodedPath}?ref=${branch}`); }
      catch (error) {
        if (/HTTP 404/.test(error.message)) throw new Error(`FAIL: missing registered E2E location ${ref.repo}/${ref.path}`);
        throw new Error(`BLOCKED: cannot verify E2E location ${ref.repo}/${ref.path} (${error.message})`);
      }
    }
  }
  for (const file of manifestFiles) {
    const manifest = readJson(file);
    try { apiJson(`repos/${repository}/issues/${manifest.feature_issue}`); }
    catch (error) { throw new Error(`BLOCKED: cannot verify feature issue #${manifest.feature_issue} (${error.message})`); }
    for (const exception of manifest.coverage_exceptions ?? []) {
      const [, owner, name, number] = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/([1-9][0-9]*)$/.exec(exception.tracking_issue) ?? [];
      try { apiJson(`repos/${owner}/${name}/issues/${number}`); }
      catch (error) { throw new Error(`BLOCKED: cannot verify coverage exception ${exception.tracking_issue} (${error.message})`); }
    }
  }
}

export function validateFeaturePromotion({ registry, manifestFiles = [], changedFiles = [], prBody = '' }) {
  const index = validateRegistry(registry);
  const manifests = manifestFiles.map((file) => validateManifest(file, prBody));
  if (new Set(manifests.map((manifest) => manifest.feature_issue)).size !== manifests.length) fail('multiple manifests register the same feature issue');
  for (const manifest of manifests) {
    for (const exception of manifest.coverage_exceptions) {
      if (!index.ids.has(exception.scenario_id)) fail(`${exception.scenario_id}: coverage exception is not in the Scenario Registry`);
    }
  }
  const changedSpecs = changedFiles.filter((file) => file.startsWith('scenarios/') && !file.startsWith('scenarios/sources/') && file !== 'scenarios/README.md' && file.endsWith('.md'));
  const changedIds = new Set(changedSpecs.map((file) => {
    const id = index.bySpec.get(file);
    if (!id) fail(`changed scenario is missing from registry: ${file}`);
    return id;
  }));
  const impacted = new Set(changedIds);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const [id, dependencies] of index.edges) {
      if (!impacted.has(id) && dependencies.some((dependency) => impacted.has(dependency))) {
        impacted.add(id);
        expanded = true;
      }
    }
  }
  const byId = new Map(registry.scenarios.map((entry) => [entry.id, entry]));
  for (const id of impacted) {
    const hasTests = byId.get(id).e2e_tests.length > 0;
    const hasException = manifests.some((manifest) => manifest.coverage_exceptions.some((exception) => exception.scenario_id === id));
    if (!hasTests && !hasException) fail(`${id}: changed/affected scenario has no registered E2E; add coverage or a reviewed exception`);
  }
  if (changedIds.size > 0 && manifestFiles.length === 0) fail('scenario change requires a feature manifest linked to its architecture issue');
  return { changedScenarioIds: [...changedIds].sort(), impactedScenarioIds: [...impacted].sort() };
}

function main() {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const headIndex = args.indexOf('--head');
  let changedFiles = [];
  if (baseIndex >= 0 && headIndex >= 0) {
    changedFiles = execFileSync('git', ['diff', '--name-only', `${args[baseIndex + 1]}...${args[headIndex + 1]}`], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  }
  const manifestFiles = fs.existsSync(path.join(ROOT, 'features'))
    ? execFileSync('find', ['features', '-type', 'f', '-name', 'manifest.json'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    : [];
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const event = eventPath && fs.existsSync(eventPath) ? JSON.parse(fs.readFileSync(eventPath, 'utf8')) : {};
  const prBody = event.pull_request?.body ?? '';
  const registry = readJson('scenarios/REGISTRY.json');
  const result = validateFeaturePromotion({ registry, manifestFiles, changedFiles, prBody });
  if (manifestFiles.length || registry.scenarios.some((entry) => entry.e2e_tests.length > 0)) {
    if (!process.env.GITHUB_REPOSITORY) throw new Error('BLOCKED: GITHUB_REPOSITORY is unavailable');
    verifyExternalReferences(registry, manifestFiles, process.env.GITHUB_REPOSITORY);
  }
  console.log(`Gate A PASS: registry valid; changed scenarios=${result.changedScenarioIds.join(',') || 'none'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`Gate A ${error.message.startsWith('BLOCKED:') ? 'BLOCKED' : 'FAIL'}: ${error.message.replace(/^(?:BLOCKED|FAIL):\s*/, '')}`); process.exitCode = 1; }
}
