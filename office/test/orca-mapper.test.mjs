import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTerminal, readTerminals } from '../lib/sources/orca.mjs';
import { buildLiveState, personFromTerminal, peopleFromWorktrees, roomOf, issueFromBranch } from '../lib/state.mjs';

const TERMINAL = {
  handle: 'term_abc',
  ptyId: 'pty::/repo@@deadbeef',
  incarnationId: 'inc-1',
  orphaned: false,
  worktreeId: 'wt::/repo',
  worktreePath: '/repo',
  branch: 'refs/heads/feat/office-ui',
  tabId: 'tab-1',
  leafId: 'leaf-1',
  title: 'OC | DeepSeek 1',
  connected: true,
  writable: true,
  lastOutputAt: 1_794_000_000_000,
  // The field this whole module exists to forget:
  preview: 'OPENAI_API_KEY=sk-proj-AbCdEfGh12345678901234567890 and owner@example.com typed',
};

test('mapTerminal keeps the named fields only', () => {
  const mapped = mapTerminal(TERMINAL);
  assert.equal(mapped.id, 'term_abc');
  assert.equal(mapped.branch, 'feat/office-ui');
  assert.equal(mapped.provider, 'DeepSeek');
  assert.equal(mapped.connected, true);
  assert.equal(mapped.lastOutputAt, 1_794_000_000_000);
  for (const forbidden of ['preview', 'ptyId', 'incarnationId', 'tabId', 'leafId', 'worktreeId', 'writable']) {
    assert.ok(!(forbidden in mapped), `${forbidden} must not be mapped`);
  }
});

test('a terminal with no handle or title is not a person', () => {
  assert.equal(mapTerminal({ title: 'x' }), null);
  assert.equal(mapTerminal({ handle: 'h' }), null);
  assert.equal(mapTerminal(null), null);
});

test('the whole live state never carries the preview text', () => {
  const now = 1_794_000_001_000;
  const state = buildLiveState({
    orca: { ok: true, terminals: [mapTerminal(TERMINAL)] },
    tasks: { ok: false, error: 'no orchestration run selected', tasks: [] },
    git: { ok: true, worktrees: [{ path: '/repo', branch: 'feat/office-ui', dirty: true, changed: 2 }] },
    github: { ok: true, issues: [], pulls: [] },
    now,
  });
  const json = JSON.stringify(state);
  for (const secret of ['sk-proj', 'AbCdEfGh', 'owner@example.com', 'OPENAI_API_KEY', 'preview']) {
    assert.ok(!json.includes(secret), `state leaked ${secret}`);
  }
  assert.equal(state.mode, 'live');
  assert.equal(state.people.length, 1);
  assert.equal(state.sources.orca.ok, true);
  assert.equal(state.sources.tasks.ok, false);
});

test('a person is working only while the terminal is producing output', () => {
  const now = 1_794_000_100_000;
  const base = mapTerminal({ ...TERMINAL, lastOutputAt: now - 10_000 });
  assert.equal(personFromTerminal(base, { now, tasks: [], cards: new Map(), desk: 0 }).state, 'working');
  const quiet = mapTerminal({ ...TERMINAL, lastOutputAt: now - 10 * 60_000 });
  assert.equal(personFromTerminal(quiet, { now, tasks: [], cards: new Map(), desk: 0 }).state, 'idle');
  const gone = mapTerminal({ ...TERMINAL, connected: false });
  assert.equal(personFromTerminal(gone, { now, tasks: [], cards: new Map(), desk: 0 }).state, 'offline');
});

test('blocked and reviewing come from the board, not from a guess', () => {
  const now = 1_794_000_100_000;
  const terminal = mapTerminal({ ...TERMINAL, branch: 'refs/heads/feat/office-208' });
  const blockedCards = new Map([[208, { number: 208, title: 'x', column: 'build', state: 'blocked' }]]);
  const reviewCards = new Map([[208, { number: 208, title: 'x', column: 'review', state: 'open' }]]);
  assert.equal(personFromTerminal(terminal, { now, tasks: [], cards: blockedCards, desk: 0 }).state, 'blocked');
  assert.equal(personFromTerminal(terminal, { now, tasks: [], cards: reviewCards, desk: 0 }).state, 'reviewing');
});

test('rooms: title first, then branch, then dev', () => {
  assert.equal(roomOf('LEAD | xqa', null), 'lead');
  assert.equal(roomOf('OC | QA 1', null), 'qa');
  assert.equal(roomOf('SA | Systems 1', null), 'sa');
  assert.equal(roomOf('OC | DeepSeek 1', 'release/v1'), 'release');
  assert.equal(roomOf('OC | DeepSeek 1', 'feat/office-ui'), 'dev');
});

test('a branch names an issue only when it ends with one', () => {
  assert.equal(issueFromBranch('feat/mf-250-common-fixtures'), null);
  assert.equal(issueFromBranch('feat/office-208'), 208);
  assert.equal(issueFromBranch(null), null);
});

test('without Orca, people come from git and say so', () => {
  const people = peopleFromWorktrees([
    { path: '/repo', branch: 'develop', dirty: false, bare: false },
    { path: '/repo/.scratch/wt-a', branch: 'feat/office-1', dirty: true, bare: false },
    { path: '/bare.git', branch: null, bare: true },
  ]);
  assert.equal(people.length, 2);
  assert.equal(people[0].provider, null);
  assert.equal(people[0].state, 'idle');
  assert.equal(people[1].state, 'working');
});

test('readTerminals reports a missing CLI instead of throwing', async () => {
  const answer = await readTerminals({ command: 'definitely-not-a-real-cli-xyz', timeoutMs: 2_000 });
  assert.equal(answer.ok, false);
  assert.ok(typeof answer.error === 'string' && answer.error.length > 0);
  assert.deepEqual(answer.terminals, []);
});