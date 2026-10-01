#!/usr/bin/env node
'use strict';

// Z01 / AC-40: the coverage table records credential NAMES only. A value would be a leak into
// a repository, an issue, a log and a PR body at once — so this is a gate, not a review note.
//
// The scan is by VALUE SHAPE, not by key name: a key called `token` holding `ghp_…` must fail
// exactly like a key called `password_note`. Both secret families the org actually uses are
// covered (GitHub tokens, OpenAI-style keys), plus anything that looks like a PEM block or an
// Authorization header. Exit 0 = clean, 1 = a value is present (path reported, value never printed).

const fs = require('fs');
const path = require('path');

const VALUE_PATTERNS = [
  ['github-token', /gh[pousr]_[A-Za-z0-9]{20,}/],
  ['github-fine-grained-pat', /github_pat_[A-Za-z0-9_]{20,}/],
  ['openai-style-key', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['authorization-header', /\bBearer\s+[A-Za-z0-9_.\-]{16,}/],
  ['basic-auth-url', /\b[a-z][a-z0-9+.\-]*:\/\/[^/\s:@]+:[^/\s@]+@/i],
];

function scan(value, where, out, pathTrail = '$') {
  if (typeof value === 'string') {
    for (const [id, re] of VALUE_PATTERNS) {
      if (re.test(value)) out.push({ path: `${pathTrail} (${where})`, id });
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, where, out, `${pathTrail}[${i}]`));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) scan(v, where, out, `${pathTrail}.${k}`);
    return out;
  }
  return out;
}

function main() {
  const file = path.resolve(process.argv[2] || 'docs/inventory/repo-coverage.json');
  if (!fs.existsSync(file)) {
    process.stderr.write(`assert-no-credential-values: file not found: ${file}\n`);
    return 2;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const findings = scan(raw, 'raw text', [], '$').concat(scan(JSON.parse(raw), 'parsed', []));
  if (!findings.length) {
    process.stdout.write(`assert-no-credential-values: clean (${file})\n`);
    return 0;
  }
  for (const f of findings) process.stderr.write(`assert-no-credential-values: ${f.id} at ${f.path}\n`);
  return 1;
}

process.exit(main());