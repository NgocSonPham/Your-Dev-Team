#!/usr/bin/env node
/**
 * issue-flow — the issue lifecycle gate for this repository. See ISSUE-FLOW.md.
 *
 * The script is the only writer of the gate labels, so "closed" cannot be reached
 * by hand. It uses the `gh` CLI (authenticated with `repo` scope); GitHub Actions
 * are not used because Actions billing is blocked here.
 *
 *   node scripts/issue-flow.mjs setup-labels
 *   node scripts/issue-flow.mjs create --lane C1 --title "..." --body <file> [--area fixtures] [--priority P1] [--milestone "MF-259 hotfix"]
 *   node scripts/issue-flow.mjs no-sa --issue 12 --reason "mechanical fix, shape pinned by the issue"
 *   node scripts/issue-flow.mjs evidence --issue 12 --file .scratch/r2-report.md --head <sha> [--note "targeted specs"]
 *   node scripts/issue-flow.mjs gate --issue 12 --role sa-systems|sa-code|qa --verdict approve|changes|pass|fail --file <review>
 *   node scripts/issue-flow.mjs close --issue 12 --merge-sha <sha7> [--sa-systems <url>] [--sa-code <url>] [--qa <url>]
 *   node scripts/issue-flow.mjs status
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/sk-[A-Za-z0-9_-]{20,}/, 'sk- API key'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained token'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*['"]?[^\s'"]{10,}/i, 'credential assignment'],
  [/Bearer\s+[A-Za-z0-9._-]{20,}/, 'bearer token'],
];

function assertNoSecrets(text, where) {
  for (const [re, name] of SECRET_PATTERNS) {
    if (re.test(text)) {
      console.error(`REFUSED: ${where} looks like it contains a ${name}. Remove it and link the artifact instead.`);
      process.exit(2);
    }
  }
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input }).trim();
}

function readBody(file) {
  const text = readFileSync(file, 'utf8');
  assertNoSecrets(text, file);
  return text;
}

function labelsOf(number) {
  const raw = gh(['issue', 'view', String(number), '--json', 'labels,title,number']);
  return JSON.parse(raw);
}

function names(issue) {
  return (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
}

function ensureLabel(name, color = 'ededed') {
  try {
    gh(['label', 'create', name, '--color', color, '--force']);
  } catch (error) {
    throw new Error(`label ${name}: ${String(error).slice(0, 160)}`);
  }
}

const SA_GATES = ['gate:sa-systems-approved', 'gate:sa-code-approved'];
const DONE_GATES = [...SA_GATES, 'gate:qa-passed'];

function hasAll(namesList, required) {
  return required.every((n) => namesList.includes(n));
}

function saExempt(namesList) {
  return namesList.includes('sa-not-required') || namesList.includes('owner-override');
}

function allGates(namesList) {
  return namesList.includes('gate:qa-passed') && (hasAll(namesList, SA_GATES) || saExempt(namesList));
}

function syncReady(number) {
  const issue = labelsOf(number);
  const list = names(issue);
  if (allGates(list) && !list.includes('status:ready-to-merge')) {
    gh(['issue', 'edit', String(number), '--add-label', 'status:ready-to-merge']);
  }
}

function setupLabels() {
  const fixed = [
    ['lane:tbd', 'ededed'],
    ['sa-not-required', 'c2e0c6'],
    ['owner-override', 'fbca04'],
    ['gate:sa-systems-approved', '0e8a16'],
    ['gate:sa-systems-changes', 'b60205'],
    ['gate:sa-code-approved', '0e8a16'],
    ['gate:sa-code-changes', 'b60205'],
    ['gate:qa-passed', '0e8a16'],
    ['gate:qa-failed', 'b60205'],
    ['status:ready-to-merge', '1d76db'],
    ['status:merged', '5319e7'],
    ['blocked', 'd93f0b'],
  ];
  for (const [name, color] of fixed) ensureLabel(name, color);
  for (const p of ['P0', 'P1', 'P2', 'P3']) ensureLabel(p, p === 'P0' || p === 'P1' ? 'b60205' : 'd4c5f9');
  console.log(`labels ready (${String(fixed.length + 4)})`);
}

function create(opts) {
  if (!opts.body) throw new Error('create needs --body <filled docs/process/templates/issue.md>');
  readBody(opts.body);
  const lane = String(opts.lane ?? 'tbd').toLowerCase();
  const tags = [`lane:${lane}`];
  if (opts.priority) tags.push(String(opts.priority).toUpperCase());
  if (opts.area) tags.push(`area:${String(opts.area).toLowerCase()}`);
  for (const l of tags) ensureLabel(l);
  const args = ['issue', 'create', '--title', opts.title, '--body-file', opts.body, '--label', tags.join(',')];
  if (opts.milestone) args.push('--milestone', opts.milestone);
  console.log(gh(args));
}

function noSa(opts) {
  const reason = opts.reason ?? 'the lead judged the shape already pinned';
  gh(['issue', 'comment', String(opts.issue), '--body-file', '-'], `### SA not required\n\nLead decision: ${reason}`);
  gh(['issue', 'edit', String(opts.issue), '--add-label', 'sa-not-required']);
  syncReady(opts.issue);
  console.log(`sa-not-required recorded on #${String(opts.issue)}`);
}

function evidence(opts) {
  const text = readBody(opts.file);
  const head = opts.head ? `\n**Head:** \`${opts.head}\`` : '';
  const note = opts.note ? `\n**Note:** ${opts.note}` : '';
  const body = [
    '### Evidence (append-only)',
    `**By:** ${opts.actor ?? 'lead'} · **At:** ${new Date().toISOString()}${head}${note}`,
    `<details><summary>${opts.file}</summary>`,
    '',
    text.slice(0, 60000),
    '',
    '</details>',
  ].join('\n');
  gh(['issue', 'comment', String(opts.issue), '--body-file', '-'], body);
  console.log(`evidence posted to #${String(opts.issue)}`);
}

function gate(opts) {
  const text = readBody(opts.file);
  const role = String(opts.role).toLowerCase();
  const verdict = String(opts.verdict).toLowerCase();
  const map = {
    'sa-systems:approve': ['gate:sa-systems-approved', 'gate:sa-systems-changes'],
    'sa-systems:changes': ['gate:sa-systems-changes', 'gate:sa-systems-approved'],
    'sa-code:approve': ['gate:sa-code-approved', 'gate:sa-code-changes'],
    'sa-code:changes': ['gate:sa-code-changes', 'gate:sa-code-approved'],
    'qa:pass': ['gate:qa-passed', 'gate:qa-failed'],
    'qa:fail': ['gate:qa-failed', 'gate:qa-passed'],
  };
  const pair = map[`${role}:${verdict}`];
  if (!pair) throw new Error(`unknown gate ${role}/${verdict}`);
  gh(['issue', 'comment', String(opts.issue), '--body-file', '-'], `### ${role.toUpperCase()} verdict: ${verdict.toUpperCase()}\n\n${text}`);
  gh(['issue', 'edit', String(opts.issue), '--add-label', pair[0], '--remove-label', pair[1]]);
  syncReady(opts.issue);
  console.log(`${role} ${verdict} recorded on #${String(opts.issue)}`);
}

function close(opts) {
  const issue = labelsOf(opts.issue);
  const list = names(issue);
  if (!allGates(list)) {
    const missing = DONE_GATES.filter((n) => !list.includes(n));
    console.error(`REFUSED: #${String(opts.issue)} lacks ${missing.join(', ')} and no sa-not-required/owner-override label.`);
    process.exit(3);
  }
  const body = [
    '### Closed',
    `Merge SHA: \`${opts.mergeSha ?? 'unknown'}\``,
    opts.saSystems ? `SA-Systems: ${opts.saSystems}` : 'SA-Systems: gate label',
    opts.saCode ? `SA-Code: ${opts.saCode}` : 'SA-Code: gate label',
    opts.qa ? `QA: ${opts.qa}` : 'QA: gate label',
    'All required evidence is linked above; anything left unverified is stated in this issue.',
  ].join('\n');
  gh(['issue', 'comment', String(opts.issue), '--body-file', '-'], body);
  gh(['issue', 'edit', String(opts.issue), '--add-label', 'status:merged']);
  gh(['issue', 'close', String(opts.issue)]);
  console.log(`closed #${String(opts.issue)}`);
}

function status() {
  const raw = gh(['issue', 'list', '--limit', '100', '--json', 'number,title,labels']);
  for (const issue of JSON.parse(raw)) {
    const gates = names(issue)
      .filter((n) => n.startsWith('gate:') || n.startsWith('status:') || n === 'sa-not-required' || n === 'blocked')
      .join(',');
    console.log(`#${String(issue.number).padStart(3)} ${issue.title.slice(0, 66).padEnd(66)} ${gates}`);
  }
}

function parse(argv) {
  const out = {};
  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) out[key.slice(2)] = true;
    else {
      out[key.slice(2)] = value;
      i += 1;
    }
  }
  return out;
}

const [command] = process.argv.slice(2);
const opts = parse(process.argv.slice(2));
try {
  if (command === 'setup-labels') setupLabels();
  else if (command === 'create') create(opts);
  else if (command === 'no-sa') noSa(opts);
  else if (command === 'evidence') evidence(opts);
  else if (command === 'gate') gate(opts);
  else if (command === 'close') close(opts);
  else if (command === 'status') status();
  else {
    console.error('usage: setup-labels | create | no-sa | evidence | gate | close | status (see the header)');
    process.exit(1);
  }
} catch (error) {
  console.error(String(error).slice(0, 400));
  process.exit(1);
}
