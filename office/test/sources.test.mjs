import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorktreePorcelain } from '../lib/sources/git.mjs';
import { columnOf, ownerLane, priorityOf, mapIssue, mapPull, labelNames, COLUMNS } from '../lib/sources/github.mjs';
import { diffStates, buildLiveState } from '../lib/state.mjs';
import { demoState } from '../lib/demo.mjs';

test('git porcelain: worktrees, branches and detached HEAD', () => {
  const text = [
    'worktree /repo',
    'HEAD 1111111111111111111111111111111111111111',
    'branch refs/heads/develop',
    '',
    'worktree /repo/.scratch/wt-a',
    'HEAD 2222222222222222222222222222222222222222',
    'branch refs/heads/feat/office-ui',
    '',
    'worktree /repo/.scratch/wt-b',
    'HEAD 3333333333333333333333333333333333333333',
    'detached',
    '',
    '',
  ].join('\n');
  const rows = parseWorktreePorcelain(text);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].branch, 'develop');
  assert.equal(rows[1].branch, 'feat/office-ui');
  assert.equal(rows[2].detached, true);
  assert.equal(rows[2].branch, null);
});

test('labels: strings and objects both read', () => {
  assert.deepEqual(labelNames(['lane:dev', { name: 'P1' }]), ['lane:dev', 'P1']);
  assert.deepEqual(labelNames(undefined), []);
});

test('a card has an OWNER lane and a COLUMN, and they never substitute for each other', () => {
  // lane:* is free-form in this repo (issue-flow create --lane) — it names the owner, not the column.
  assert.equal(ownerLane(['lane:dev']), 'dev');
  assert.equal(ownerLane(['lane:tbd']), null);
  assert.equal(ownerLane([]), null);
  // The column comes from status labels, then the card's state.
  assert.equal(columnOf(['status:ready-to-merge'], 'open'), 'merge');
  assert.equal(columnOf([], 'closed'), 'merge');
  assert.equal(columnOf([], 'open'), 'triage');
  assert.ok(COLUMNS.includes('unknown'));
});

test('a blocked issue keeps its lane and its blocked state', () => {
  const card = mapIssue({ number: 12, title: 'x', state: 'OPEN', labels: [{ name: 'lane:build' }, { name: 'blocked' }, { name: 'P0' }] });
  assert.equal(card.lane, 'build');
  assert.equal(card.column, 'triage');
  assert.equal(card.state, 'blocked');
  assert.equal(card.priority, 'P0');
  const inReview = mapIssue({ number: 13, title: 'y', state: 'OPEN', labels: [{ name: 'lane:qa' }, { name: 'status:in-review' }] });
  assert.equal(inReview.lane, 'qa');
  assert.equal(inReview.column, 'review');
});

test('a draft PR is a draft and a released branch is merge', () => {
  const draft = mapPull({ number: 3, title: 'wip', state: 'OPEN', isDraft: true, headRefName: 'feat/x', labels: [] });
  assert.equal(draft.state, 'draft');
  assert.equal(draft.draft, true);
  const release = mapPull({ number: 4, title: 'release', state: 'OPEN', isDraft: false, headRefName: 'release/v1', labels: [] });
  assert.equal(release.column, 'merge');
  // An open pull request is somewhere in review, and carries no owner lane of its own.
  const open = mapPull({ number: 5, title: 'x', state: 'OPEN', isDraft: false, headRefName: 'feat/x', labels: [] });
  assert.equal(open.column, 'review');
  assert.equal(open.lane, null);
});

test('an issue title is redacted on the way in', () => {
  const card = mapIssue({ number: 9, title: 'rotate key sk-proj-AbCdEfGh12345678901234567890', state: 'OPEN', labels: [] });
  assert.ok(!card.title.includes('sk-proj'));
  assert.ok(card.title.includes('[redacted]'));
});

test('diff sends nothing when nothing changed, and one patch per change', () => {
  const before = demoState(10);
  const same = demoState(10);
  const updated = { ...same, updatedAt: '2030-01-01T00:00:00.000Z' };
  assert.deepEqual(diffStates(before, updated).map((p) => p.type), ['tick']);

  const moved = JSON.parse(JSON.stringify(before));
  moved.people[0].state = moved.people[0].state === 'idle' ? 'working' : 'idle';
  const patches = diffStates(before, moved);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].type, 'person');
  assert.equal(patches[0].id, moved.people[0].id);

  const board = JSON.parse(JSON.stringify(before));
  board.board.issues[0].column = 'merge';
  const boardPatches = diffStates(before, board);
  assert.ok(boardPatches.some((p) => p.type === 'board' && p.number === board.board.issues[0].number));
});

test('a failing source keeps the time it last answered', () => {
  const now = 1_794_000_000_000;
  const first = buildLiveState({
    orca: { ok: true, terminals: [] },
    tasks: { ok: false, error: 'no orchestration run selected', tasks: [] },
    git: { ok: true, worktrees: [] },
    github: { ok: true, issues: [], pulls: [] },
    now,
  });
  const second = buildLiveState({
    orca: { ok: false, error: 'orca is not available', terminals: [] },
    tasks: { ok: false, error: 'no orchestration run selected', tasks: [] },
    git: { ok: true, worktrees: [] },
    github: { ok: true, issues: [], pulls: [] },
    now: now + 60_000,
    previous: first,
  });
  assert.equal(second.sources.orca.ok, false);
  assert.equal(second.sources.orca.lastOkAt, first.sources.orca.lastOkAt);
});