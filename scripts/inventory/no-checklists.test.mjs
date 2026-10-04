/**
 * Архитектура — декларативные требования, а не чеклисты и планы (владелец, 04.10.2026).
 *
 * Чеклисты (`- [ ]` / `- [x]`) и планы с шагами не живут в репозитории: они протухают,
 * расходятся с issues и плодят merge-конфликты между параллельными сессиями. Статус
 * требований — в GitHub (Project «Trained Assist — Migration», issues), не в файлах.
 *
 * Исключение — `scenarios/sources/`: там `- [ ]` это шаг сценария (DSL), а не чеклист.
 * Это декларативное определение сценария, а не трекер выполнения.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Каталоги, где чеклисты/планы не ожидаются и не разрешены. */
const SCAN_DIRS = ['.'];
/** Относительные пути, которые сканируются целиком (без исключений внутри). */
const EXCLUDED_PREFIXES = [
  '.git/',
  'node_modules/',
  '.repo-context/',
  // Шаги сценария используют `- [ ]` как DSL — это не чеклист.
  'scenarios/sources/',
];

const CHECKLIST = /^\s*[-*]\s\[[ xX]\]\s/;
const TODO = /\b(TODO|FIXME|XXX|HACK)\b/;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function isExcluded(rel) {
  if (EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix))) return true;
  // node_modules может быть вложенным (pilots/p-db/cf-workflows/node_modules/…)
  if (rel.split('/').includes('node_modules')) return true;
  return false;
}

const files = walk(ROOT)
  .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
  .filter((rel) => !isExcluded(rel))
  .sort();

test('в репозитории нет чеклистов: `- [ ]` / `- [x]` запрещены', () => {
  const offenders = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (CHECKLIST.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Чеклисты запрещены — статус требований живёт в GitHub issues, не в файлах.\nНайдено:\n  ${offenders.join('\n  ')}`,
  );
});

test('в репозитории нет TODO/FIXME/XXX/HACK', () => {
  const offenders = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (TODO.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `TODO/FIXME запрещены — незавершённая работа заводится в issues, а не в комментариях плана.\nНайдено:\n  ${offenders.join('\n  ')}`,
  );
});

test('файла checklist.md нет: чеклисты не живут в репозитории', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'checklist.md')), false);
});
