import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// regenerate.mjs <tool_dir> <output_dir> <tool_ref>
//
// Подъём пина и перегенерация таблицы — ОДНА атомарная операция, выполненная читателем гейта.
// Раньше это были два шага руками: закоммитить таблицу с новым profile_ref, а потом уже
// генерировать. Первый же запуск падал — генератор читал ref из старой таблицы и проверял старый
// тег, где новой функции нет (курица и яйцо). Поэтому ref приходит ВХОДОМ, а не читается из
// таблицы, и генератор сам записывает его в результат.

const [toolDir, outputDir, ref] = process.argv.slice(2);
const tool = path.resolve(toolDir || '');
const output = path.resolve(outputDir || 'docs/inventory');
if (!tool || !output || !ref) throw Error('usage: regenerate.mjs <tool_dir> <output_dir> <tool_ref>');
if (!/^v\d+\.\d+\.\d+$/.test(ref)) throw Error(`invalid tool_ref: ${ref}`);

const sha = execFileSync('git', ['-C', tool, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tagSha = execFileSync('git', ['-C', tool, 'rev-parse', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
if (sha !== tagSha) throw Error(`tool checkout ${sha} does not match ${ref} (${tagSha})`);

const { buildCoverage, renderCoverageMd, renderStableJson, COVERAGE_COLUMNS } = await import(pathToFileURL(path.join(tool, 'scripts/lib/devbaseline/inventory.mjs')));
const entries = JSON.parse(fs.readFileSync(path.join(tool, 'inventory/repos.json')));
// This repository must describe the current PR tree, otherwise adding inventory itself
// guarantees self-drift immediately after merge. Other repositories use their live defaults.
const self = entries.find(e => e.repo === 'trained-assist/trained-agent-architecture');
if (!self) throw Error('coverage input omits its owner');
self.path = process.cwd();
const result = await buildCoverage(entries, { profileRef: ref });
// A repository this reader cannot see is DATA, not a broken run (R8). Refusing to write the table
// at all meant the table could only ever be produced by a reader with MORE access than the gate
// has — which is exactly how the gate ended up comparing two different tables. The blind spot is
// written down, compared by (repo, read_state), and reported.
const blind = result.rows.filter(r => r.read_state === 'no_access').map(r => r.repo);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'repo-coverage.json'), JSON.stringify({ generated_by: `pr-autofix ${ref}`, columns: COVERAGE_COLUMNS, repos: result.rows }, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'repo-coverage.md'), renderCoverageMd({ rows: result.rows, profileRef: ref, unreadable: result.unreadable }));
fs.writeFileSync(path.join(output, 'repo-coverage.stable.json'), renderStableJson({ rows: result.rows, profileRef: ref, unreadable: result.unreadable }));
execFileSync(process.execPath, ['scripts/inventory/assert-no-credential-values.js', path.join(output, 'repo-coverage.json')], { stdio: 'inherit' });
console.log(`coverage: ${result.rows.length} repositories, ${blind.length} not visible to this reader, profile_ref=${ref}, tool_sha=${sha}`);
if (blind.length) console.log(`not visible: ${blind.join(', ')} — grant the reader access, then regenerate`);
