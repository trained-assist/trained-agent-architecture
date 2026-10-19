#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ACCEPTED_CHECKS = new Set(['success', 'neutral', 'skipped']);

export class GateBError extends Error {
  constructor(state, message) { super(message); this.state = state; }
}

function parseRef(ref) {
  const match = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([1-9][0-9]*)$/.exec(ref);
  if (!match) throw new GateBError('FAIL', `Invalid PR dependency reference: ${ref}`);
  return { repo: match[1], number: Number(match[2]) };
}

function checkGraph(items) {
  const refs = new Set(items.map(({ repo, number }) => `${repo}#${number}`));
  const visiting = new Set();
  const done = new Set();
  const byRef = new Map(items.map((item) => [`${item.repo}#${item.number}`, item]));
  function visit(ref) {
    if (visiting.has(ref)) throw new GateBError('FAIL', `PR dependency cycle includes ${ref}`);
    if (done.has(ref)) return;
    if (!refs.has(ref)) throw new GateBError('FAIL', `PR dependency is not registered: ${ref}`);
    visiting.add(ref);
    for (const dependency of byRef.get(ref).depends_on ?? []) visit(dependency);
    visiting.delete(ref);
    done.add(ref);
  }
  for (const ref of refs) visit(ref);
  for (const item of items) {
    if (item.required && item.depends_on.some((dep) => byRef.get(dep)?.required === false)) {
      throw new GateBError('FAIL', `Required PR ${item.repo}#${item.number} depends on an optional PR`);
    }
  }
}

function matchesFeature(body, issue) {
  return new RegExp(`(?:#${issue}\\b|issues/${issue}\\b)`).test(body ?? '');
}

function assertCheckRuns(data, status, required, repo, sha) {
  if (!data || !Number.isInteger(data.total_count) || !Array.isArray(data.check_runs) || data.total_count !== data.check_runs.length) {
    throw new GateBError('BLOCKED', `${repo}@${sha}: check-run response is partial or malformed`);
  }
  if (!Array.isArray(required) || required.length === 0) throw new GateBError('BLOCKED', `${repo}: branch protection has no readable required checks`);
  const contexts = new Map();
  for (const run of data.check_runs) {
    const previous = contexts.get(run.name);
    if (!previous || Date.parse(run.completed_at ?? run.started_at ?? run.created_at) > Date.parse(previous.completed_at ?? previous.started_at ?? previous.created_at)) contexts.set(run.name, run);
  }
  for (const context of status?.statuses ?? []) {
    const previous = contexts.get(context.context);
    if (!previous) contexts.set(context.context, { name: context.context, status: 'completed', conclusion: context.state });
  }
  for (const requirement of required) {
    const name = typeof requirement === 'string' ? requirement : requirement.context;
    const run = contexts.get(name) ?? [...contexts.values()].find((candidate) => candidate.name.startsWith(`${name} /`));
    if (!run) throw new GateBError('FAIL', `${repo}@${sha}: required check is missing: ${name}`);
    if (run.status !== 'completed') throw new GateBError('BLOCKED', `${repo}@${sha}: required check is still running: ${name}`);
    if (!ACCEPTED_CHECKS.has(run.conclusion)) throw new GateBError('FAIL', `${repo}@${sha}: required check failed: ${name}=${run.conclusion}`);
    if (typeof requirement === 'object' && requirement.app_id != null && run.app?.id != null && requirement.app_id !== run.app.id) {
      throw new GateBError('FAIL', `${repo}@${sha}: required check ${name} came from unexpected GitHub App ${run.app.id}`);
    }
  }
}

export async function runGateB({ manifest, architecturePr, github }) {
  if (!manifest || manifest.schema_version !== 1 || !Number.isInteger(manifest.feature_issue)) throw new GateBError('FAIL', 'Feature manifest is invalid');
  if (!architecturePr || architecturePr.state !== 'open') throw new GateBError('FAIL', 'Architecture PR must remain open until Gate C acceptance');
  if (architecturePr.draft === true) throw new GateBError('FAIL', 'Architecture PR must be Ready for Review before Gate B');
  if (!matchesFeature(architecturePr.body, manifest.feature_issue)) throw new GateBError('FAIL', `Architecture PR does not reference feature issue #${manifest.feature_issue}`);
  if (!Array.isArray(manifest.pull_requests) || manifest.pull_requests.length === 0) throw new GateBError('FAIL', 'Manifest has no implementation/E2E PRs registered');

  if (!architecturePr.base?.ref || !architecturePr.base?.repo?.full_name) throw new GateBError('BLOCKED', 'Architecture PR has no readable base repository/branch');
  let architectureProtection;
  try { architectureProtection = await github.getRequiredChecks(architecturePr.base.repo.full_name, architecturePr.base.ref); }
  catch (error) { throw new GateBError('BLOCKED', `Cannot verify architecture branch protection (${error.message})`); }
  if (!architectureProtection?.strict || !architectureProtection.checks?.length) throw new GateBError('BLOCKED', 'Architecture base branch has no strict required-check protection');

  checkGraph(manifest.pull_requests);
  const candidate = [];
  const observed = [];
  for (const item of manifest.pull_requests) {
    const ref = `${item.repo}#${item.number}`;
    let pr;
    try { pr = await github.getPullRequest(item.repo, item.number); }
    catch (error) { throw new GateBError('BLOCKED', `${ref}: GitHub API unavailable or permission denied (${error.message})`); }
    if (!pr || !['open', 'closed'].includes(pr.state) || !pr.head?.sha || !pr.base?.ref) throw new GateBError('BLOCKED', `${ref}: incomplete GitHub PR response`);
    if (!matchesFeature(pr.body, manifest.feature_issue)) throw new GateBError('FAIL', `${ref}: PR description does not link feature issue #${manifest.feature_issue}`);
    if (pr.state === 'closed' && !pr.merged_at) throw new GateBError('FAIL', `${ref}: PR is closed without merge`);
    if (item.required && (!pr.merged_at || !pr.merge_commit_sha)) throw new GateBError('FAIL', `${ref}: required PR is not merged`);
    if (!pr.merged_at) {
      observed.push({ ref, state: 'open-optional', role: item.role });
      continue;
    }

    let checks;
    let protection;
    let status;
    try {
      [checks, protection, status] = await Promise.all([
        github.getCheckRuns(item.repo, pr.head.sha),
        github.getRequiredChecks(item.repo, pr.base.ref),
        github.getCommitStatus(item.repo, pr.head.sha)
      ]);
    }
    catch (error) { throw new GateBError('BLOCKED', `${ref}: cannot read CI/branch protection for head SHA ${pr.head.sha} (${error.message})`); }
    if (!protection || protection.strict !== true || !Array.isArray(protection.checks)) throw new GateBError('BLOCKED', `${ref}: cannot prove strict branch protection and its required checks`);
    assertCheckRuns(checks, status, protection.checks, item.repo, pr.head.sha);
    candidate.push({ repo: item.repo, sha: pr.merge_commit_sha });
    observed.push({ ref, role: item.role, headSha: pr.head.sha, mergeSha: pr.merge_commit_sha, checks: checks.total_count });
  }

  const pinned = manifest.sandbox_acceptance?.candidate_revisions;
  if (!Array.isArray(pinned)) throw new GateBError('FAIL', 'Manifest has no candidate revision set');
  const key = ({ repo, sha }) => `${repo}@${sha}`;
  const actualSet = [...new Set(candidate.map(key))].sort();
  const pinnedSet = pinned.map(key).sort();
  if (new Set(pinnedSet).size !== pinnedSet.length || JSON.stringify(actualSet) !== JSON.stringify(pinnedSet)) {
    throw new GateBError('FAIL', `Pinned sandbox candidate revisions are stale or incomplete; expected ${actualSet.join(', ') || '(none)'}, found ${pinnedSet.join(', ') || '(none)'}`);
  }
  return { state: 'PASS', featureIssue: manifest.feature_issue, architectureProtection: architectureProtection.checks, pullRequests: observed, candidateRevisions: candidate };
}

function ghApi(endpoint) {
  const result = spawnSync('gh', ['api', endpoint], { encoding: 'utf8', env: process.env });
  if (result.error || result.status !== 0) {
    const reason = (result.stderr || result.error?.message || `gh exited ${result.status}`).trim().replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(reason);
  }
  try { return JSON.parse(result.stdout); }
  catch { throw new Error('GitHub API returned invalid JSON'); }
}

function ghApiPaged(endpoint) {
  const result = spawnSync('gh', ['api', '--paginate', '--slurp', endpoint], { encoding: 'utf8', env: process.env });
  if (result.error || result.status !== 0) {
    const reason = (result.stderr || result.error?.message || `gh exited ${result.status}`).trim().replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(reason);
  }
  try { return JSON.parse(result.stdout).flat(); }
  catch { throw new Error('GitHub API returned invalid paginated JSON'); }
}

function branchPatternMatches(pattern, branch, defaultBranch) {
  if (pattern === '~ALL') return true;
  if (pattern === '~DEFAULT_BRANCH') return branch === defaultBranch;
  const prefix = pattern.startsWith('refs/heads/') ? 'refs/heads/' : '';
  const glob = prefix ? pattern.slice(prefix.length) : pattern;
  const expression = new RegExp(`^${glob.split('*').map((part) => part.replace(/[.+?^${}()|[\\]\\]/g, '\\$&')).join('.*')}$`);
  return expression.test(branch);
}

function rulesetTargetsBranch(ruleset, branch, defaultBranch) {
  if (ruleset.target !== 'branch' || ruleset.enforcement !== 'active') return false;
  const names = ruleset.conditions?.ref_name;
  if (!names || !Array.isArray(names.include) || names.include.length === 0) return false;
  if (!names.include.some((pattern) => branchPatternMatches(pattern, branch, defaultBranch))) return false;
  return !(names.exclude ?? []).some((pattern) => branchPatternMatches(pattern, branch, defaultBranch));
}

function requiredChecksForBranch(repo, branch) {
  try {
    const protection = ghApi(`repos/${repo}/branches/${encodeURIComponent(branch)}/protection/required_status_checks`);
    const checks = protection.checks?.length ? protection.checks : (protection.contexts ?? []).map((context) => ({ context }));
    return { strict: protection.strict === true, checks };
  } catch (classicError) {
    try {
      const repository = ghApi(`repos/${repo}`);
      const rulesets = ghApiPaged(`repos/${repo}/rulesets?includes_parents=true&per_page=100`);
      const matched = rulesets.filter((ruleset) => rulesetTargetsBranch(ruleset, branch, repository.default_branch));
      const checkRules = [];
      for (const ruleset of matched) {
        const details = ghApi(`repos/${repo}/rulesets/${ruleset.id}`);
        for (const rule of details.rules ?? []) {
          if (rule.type === 'required_status_checks') checkRules.push(rule.parameters ?? {});
        }
      }
      if (checkRules.length === 0) return { strict: false, checks: [], reason: `No active strict required-check rule for ${branch}` };
      const checks = checkRules.flatMap((rule) => rule.required_status_checks ?? []);
      return {
        strict: checkRules.every((rule) => rule.strict_required_status_checks_policy === true),
        checks
      };
    } catch (rulesetError) {
      throw new Error(`classic protection unavailable (${classicError.message}); rulesets unavailable (${rulesetError.message})`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const manifestPath = get('--manifest');
  const architecturePrNumber = Number(get('--architecture-pr'));
  if (!manifestPath || !Number.isInteger(architecturePrNumber) || architecturePrNumber < 1) throw new GateBError('FAIL', 'Usage: gate-b.mjs --manifest <path> --architecture-pr <number>');
  if (!/^features\/[1-9][0-9]*\/manifest\.json$/.test(manifestPath)) throw new GateBError('FAIL', 'Manifest path must be features/<issue>/manifest.json');
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !process.env.GH_TOKEN) throw new GateBError('BLOCKED', 'GITHUB_REPOSITORY and cross-repository GH_TOKEN are required');
  const architecturePr = ghApi(`repos/${repository}/pulls/${architecturePrNumber}`);
  if (architecturePr.state !== 'open' || !architecturePr.head?.sha) throw new GateBError('FAIL', 'Architecture PR must remain open and have a current head SHA');
  let manifestResponse;
  try { manifestResponse = ghApi(`repos/${repository}/contents/${manifestPath}?ref=${architecturePr.head.sha}`); }
  catch (error) { throw new GateBError('BLOCKED', `Cannot read manifest from architecture PR revision ${architecturePr.head.sha} (${error.message})`); }
  if (!manifestResponse?.content || manifestResponse.encoding !== 'base64') throw new GateBError('BLOCKED', 'GitHub returned an incomplete manifest response');
  let manifest;
  try { manifest = JSON.parse(Buffer.from(manifestResponse.content, 'base64').toString('utf8')); }
  catch { throw new GateBError('FAIL', 'Feature manifest in the architecture PR is invalid JSON'); }
  const github = {
    getPullRequest: async (repo, number) => ghApi(`repos/${repo}/pulls/${number}`),
    getCheckRuns: async (repo, sha) => ghApi(`repos/${repo}/commits/${sha}/check-runs?per_page=100`),
    getCommitStatus: async (repo, sha) => ghApi(`repos/${repo}/commits/${sha}/status`),
    getRequiredChecks: async (repo, branch) => requiredChecksForBranch(repo, branch)
  };
  const result = await runGateB({ manifest, architecturePr, github });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Gate B ${error.state ?? 'BLOCKED'}: ${error.message}`);
    process.exitCode = 1;
  });
}
