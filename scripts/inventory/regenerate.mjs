import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const tool = path.resolve(process.argv[2] || '');
const output = path.resolve(process.argv[3] || 'docs/inventory');
const committed = JSON.parse(fs.readFileSync('docs/inventory/repo-coverage.json'));
const refs = [...new Set(committed.repos.map(row => row.profile_ref))];
if (refs.length !== 1 || !/^v\d+\.\d+\.\d+$/.test(refs[0])) throw Error('one immutable release profile_ref is required');
const ref = refs[0];
const sha = execFileSync('git', ['-C', tool, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tagSha = execFileSync('git', ['-C', tool, 'rev-parse', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
if (sha !== tagSha) throw Error('tool checkout does not match table profile_ref');
const { buildCoverage, renderCoverageMd, COVERAGE_COLUMNS } = await import(pathToFileURL(path.join(tool, 'scripts/lib/devbaseline/inventory.mjs')));
const entries = JSON.parse(fs.readFileSync(path.join(tool, 'inventory/repos.json')));
// This repository must describe the current PR tree, otherwise adding inventory itself
// guarantees self-drift immediately after merge. Other repositories use their live defaults.
const self = entries.find(e => e.repo === 'trained-assist/trained-agent-architecture');
if (!self) throw Error('coverage input omits its owner');
self.path = process.cwd();
const result = await buildCoverage(entries, { profileRef: ref });
if (result.unreadable) throw Error(`inventory unreadable=${result.unreadable}: ${result.rows.filter(r => !r.readable).map(r => r.repo).join(', ')}`);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'repo-coverage.json'), JSON.stringify({ generated_by: `pr-autofix ${ref}`, columns: COVERAGE_COLUMNS, repos: result.rows }, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'repo-coverage.md'), renderCoverageMd({ rows: result.rows, profileRef: ref, unreadable: result.unreadable }));
execFileSync(process.execPath, ['scripts/inventory/assert-no-credential-values.js', path.join(output, 'repo-coverage.json')], { stdio: 'inherit' });
console.log(`coverage: ${result.rows.length} repositories, 0 unreadable, profile_ref=${ref}, tool_sha=${sha}`);
