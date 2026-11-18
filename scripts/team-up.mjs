#!/usr/bin/env node
/**
 * team-up — one command from a cold machine to a lead that has the board and a team forming.
 *
 *   npm run team:up                 show the GitHub board, wake (or reuse) the lead, hand it the triage
 *   npm run team:up -- --dry-run    print the board and the exact prompt, start nothing
 *   npm run team:up -- --agent codex  launch the lead with another provider
 *   npm run team:up -- --fresh      always open a new lead terminal instead of reusing one
 *
 * What it deliberately does NOT do: triage, assign, merge, or start dev lanes. Those are the lead's
 * decisions (docs/process/team.md), made after it reads the board — otherwise this script would be a
 * second, silent assigner. The lead is the root coordinator in Orca; parse this script's output is all
 * the shell does. It never uses `orchestration dispatch`, because a dispatched agent is a worker and
 * cannot start the rest of the team (nested depth is 1 by default).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const DRY = flag('dry-run');
const FRESH = flag('fresh');
const AGENT = value('agent', 'claude');
const LEAD_TITLE = 'LEAD | xqa';

function fail(message, code = 1) {
  console.error(`team-up: ${message}`);
  process.exit(code);
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  } catch (error) {
    const stderr = String(error?.stderr ?? '').trim();
    const stdout = String(error?.stdout ?? '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}${stdout ? `\n${stdout}` : ''}`);
  }
}

function json(command, args) {
  const out = run(command, args);
  const parsed = JSON.parse(out);
  // Orca wraps results in { id, ok, result }.
  return parsed?.result ?? parsed;
}

function repoRoot() {
  const here = run('git', ['rev-parse', '--show-toplevel']).trim();
  if (flag('here')) return here;
  // The lead belongs in the integration checkout, not in a lane worktree. `git worktree list` prints
  // the main checkout first; `--here` is the deliberate override for an unusual setup.
  const first = run('git', ['worktree', 'list', '--porcelain']).split('\n').find((l) => l.startsWith('worktree '));
  const main = first?.slice('worktree '.length) ?? here;
  if (main !== here) console.log(`note: running from a linked worktree; using the integration checkout ${main}`);
  return main;
}

function branchOf(root) {
  return run('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']).trim();
}

function labelNames(issue) {
  return (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
}

function has(labels, prefix) {
  return labels.some((l) => l.startsWith(prefix));
}

function classify(issue) {
  const labels = labelNames(issue);
  const lane = labels.find((l) => l.startsWith('lane:') && l !== 'lane:tbd')?.slice(5) ?? null;
  const priority = labels.find((l) => /^P[0-3]$/.test(l)) ?? null;
  const ready =
    labels.includes('status:ready-to-merge') ||
    (labels.includes('gate:qa-passed') &&
      (labels.includes('sa-not-required') ||
        (labels.includes('gate:sa-systems-approved') && labels.includes('gate:sa-code-approved'))));
  const blocked = labels.includes('blocked');
  const untriaged = !lane || !priority || labels.includes('lane:tbd');
  return { labels, lane, priority, ready, blocked, untriaged };
}

function main() {
  const root = repoRoot();
  const repo = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
  const branch = branchOf(root);
  const dirty = run('git', ['-C', root, 'status', '--porcelain']).trim().split('\n').filter(Boolean).length;

  let issues;
  try {
    issues = JSON.parse(run('gh', ['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,labels,updatedAt']));
  } catch (error) {
    fail(`cannot read GitHub issues — is the gh CLI authenticated with repo scope?\n${error.message}`);
  }

  const rows = issues
    .map((issue) => ({ ...issue, ...classify(issue) }))
    .sort((a, b) => {
      const p = (x) => Number(x.priority?.slice(1) ?? 9);
      return p(a) - p(b) || b.number - a.number;
    });

  const untriaged = rows.filter((r) => r.untriaged && !r.ready && !r.blocked);
  const ready = rows.filter((r) => r.ready);
  const blocked = rows.filter((r) => r.blocked);
  const active = rows.filter((r) => !r.untriaged && !r.ready && !r.blocked);
  const busyLanes = [...new Set(active.map((r) => r.lane).filter(Boolean))];

  console.log(`\n${repo}  ·  branch ${branch}${dirty ? `  ·  ${dirty} dirty file(s)` : ''}`);
  console.log(`open ${rows.length}  ·  untriaged ${untriaged.length}  ·  in progress ${active.length}  ·  ready ${ready.length}  ·  blocked ${blocked.length}`);
  console.log(`lanes busy: ${busyLanes.length ? busyLanes.join(', ') : 'none'}\n`);

  for (const r of rows) {
    const tags = [r.priority, r.lane ? `lane:${r.lane}` : 'lane:tbd', r.ready ? 'READY' : r.blocked ? 'BLOCKED' : r.untriaged ? 'TRIAGE' : '']
      .filter(Boolean)
      .join(' ');
    console.log(`#${String(r.number).padEnd(4)} ${tags.padEnd(24)} ${r.title.slice(0, 80)}`);
  }

  if (dirty > 0) {
    console.log(`\n! The lead checkout is dirty. Triage is safe; merging is not. Clean it before dispatching work.`);
  }

  const boardLines = rows
    .filter((r) => !r.blocked)
    .slice(0, 40)
    .map((r) => {
      const state = r.ready ? 'ready' : r.untriaged ? 'untriaged' : `lane ${r.lane}`;
      return `- #${r.number} [${r.priority ?? 'no priority'}, ${state}] ${r.title.replace(/\s+/gu, ' ').slice(0, 90)}`;
    })
    .join('\n');

  const prompt = [
    `You are the xQA LEAD seat (coordinator). First read docs/process/team.md and .claude/skills/xqa-lead/SKILL.md, then work from the board below.`,
    '',
    `Board ${repo} @ ${new Date().toISOString()} — open ${rows.length}, untriaged ${untriaged.length}, in progress ${active.length}, ready ${ready.length}, blocked ${blocked.length}.`,
    `Lanes busy: ${busyLanes.length ? busyLanes.join(', ') : 'none'}. WIP limit: 2 dev lanes building, 1 heavy job at a time.`,
    boardLines || '- (no open issues)',
    '',
    'Do this in this turn:',
    '1. Bind an Orca Run: orca orchestration run-create --objective "xQA: triage the board and prepare the team for this day" --json',
    '2. Triage every untriaged issue: one append-only comment with the lane from the free pool (and why), priority, and the SA decision with its reason. If SA is not required, record it: node scripts/issue-flow.mjs no-sa --issue N --reason "..."',
    '3. Prepare the team only for the highest-priority runnable issues: at most two dev lanes building, one heavy job at a time. Start QA and SA when there is work for them, not before. Put the seat skill (.claude/skills/xqa-dev-lane, xqa-qa, xqa-sa-systems, xqa-sa-code) in each task spec and start it with orca orchestration worker-start. No new Claude lane without explicit owner approval.',
    '4. Do not implement code. Do not merge without the SA and QA gates. Do not set the QA gate.',
    '5. End with a compact board: issue -> lane, SA yes/no, next action, blockers. Ask the owner only for decisions that change behaviour, data, money or the Prod window.',
    '',
    `Repository: ${root} (branch ${branch}). gh is authenticated; Orca is running.`,
  ].join('\n');

  if (DRY) {
    console.log('\n--- prompt that would be sent to the lead ---\n');
    console.log(prompt);
    console.log('\n--- nothing was started (--dry-run) ---');
    return;
  }

  let status;
  try {
    status = json('orca', ['status', '--json']);
  } catch (error) {
    fail(`Orca runtime is not reachable — start Orca and retry.\n${error.message}`);
  }
  if (status?.runtime?.reachable === false) fail('Orca runtime is not reachable — start Orca and retry.');

  const terminals = json('orca', ['terminal', 'list', '--json'])?.terminals ?? [];
  let lead = FRESH
    ? null
    : terminals.find(
        (t) =>
          t.connected &&
          t.worktreePath === root &&
          (t.title === LEAD_TITLE || /^LEAD\b/i.test(t.title ?? '')),
      );

  const createdNow = !lead;
  if (lead) {
    console.log(`\nreusing lead terminal ${lead.handle} (${lead.title})`);
  } else {
    console.log(`\nopening ${AGENT} as ${LEAD_TITLE} in ${basename(root)} …`);
    const created = json('orca', [
      'terminal',
      'create',
      '--worktree',
      `path:${root}`,
      '--title',
      LEAD_TITLE,
      '--command',
      AGENT,
      '--focus',
      '--json',
    ]);
    lead = created?.terminal;
    if (!lead?.handle) fail(`Orca did not return a terminal handle: ${JSON.stringify(created).slice(0, 300)}`);
  }

  // A fresh TUI needs a moment before it accepts input; an existing one should be idle.
  try {
    run('orca', ['terminal', 'wait', '--terminal', lead.handle, '--for', 'tui-idle', '--timeout-ms', createdNow ? '180000' : '20000', '--json']);
  } catch {
    fail(`lead terminal ${lead.handle} is busy (or did not become idle). Re-run with --fresh to open a new one.`);
  }

  run('orca', ['terminal', 'send', '--terminal', lead.handle, '--text', prompt, '--enter', '--json']);
  console.log(`handed the board to the lead (${lead.handle}). Watch it in Orca; the lead will report the triage and the team it starts.`);
}

try {
  main();
} catch (error) {
  fail(String(error?.message ?? error).slice(0, 1200));
}
