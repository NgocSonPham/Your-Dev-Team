/**
 * Live state — the whitelist mapping and the diff.
 *
 * Two pure functions and one orchestration helper:
 *  - `buildLiveState` turns four source answers into an `OfficeState`; every person and card is built from
 *    named fields, never by spreading a row;
 *  - `diffStates` turns two states into the minimum set of SSE patches (nothing changed → nothing sent);
 *  - `poll` runs the sources in parallel and never rejects.
 *
 * Nothing here reads a terminal preview, a prompt, a log or a file body.
 */
import { readTerminals, readTasks } from './sources/orca.mjs';
import { readGit } from './sources/git.mjs';
import { readBoard, COLUMNS } from './sources/github.mjs';
import { redact } from './redact.mjs';

/** A terminal that produced output within this window is `working`; otherwise it is `idle`. */
export const ACTIVE_WINDOW_MS = 90_000;

/** The columns the board draws, in order (lane OWNERS are a separate, free-form label). */
export const BOARD_COLUMNS = COLUMNS;

/** Rooms, in the order the office draws them. */
export const ROOMS = ['lead', 'qa', 'sa', 'dev', 'release'];

const TITLE_ROOM = [
  [/^LEAD\b/iu, 'lead'],
  [/\bQA\b/iu, 'qa'],
  [/\bSA\b|\bSA[ ·|-]/iu, 'sa'],
  [/release/iu, 'release'],
];

/** Which room a person sits in — from the title, then the branch, then `dev`. Never random. */
export function roomOf(title, branch) {
  for (const [pattern, room] of TITLE_ROOM) if (pattern.test(title ?? '')) return room;
  if (typeof branch === 'string' && /^(?:release\/|main$|develop$)/u.test(branch)) return 'release';
  return 'dev';
}

/** The issue number a branch names, when it names one (`feat/mf-250-common-fixtures` has none). */
export function issueFromBranch(branch) {
  const m = /(?:^|[-_/])(\d{1,6})$/u.exec(String(branch ?? ''));
  return m === null ? null : Number(m[1]);
}

/** The five states, and nothing else. */
export const PERSON_STATES = Object.freeze(['working', 'reviewing', 'idle', 'blocked', 'offline']);

/**
 * One terminal → one person.
 * @param {any} terminal  the mapped terminal (see `sources/orca.mjs`)
 * @param {{ now: number, tasks: any[], cards: Map<number, any>, desk: number }} context
 */
export function personFromTerminal(terminal, context) {
  const { now, tasks, cards, desk } = context;
  const branch = terminal.branch ?? null;
  const issueNumber = issueFromBranch(branch);
  const card = issueNumber === null ? null : cards.get(issueNumber) ?? null;
  const task = tasks.find((t) => t.assignee !== null && (t.assignee === terminal.id || t.assignee === terminal.title)) ?? null;
  const quietFor = terminal.lastOutputAt === null ? Number.POSITIVE_INFINITY : now - terminal.lastOutputAt;
  const offline = !terminal.connected || terminal.orphaned;
  const blocked = card?.state === 'blocked';
  const reviewing = card?.column === 'review' || card?.column === 'verify';
  const state = offline ? 'offline' : blocked ? 'blocked' : reviewing ? 'reviewing' : quietFor <= ACTIVE_WINDOW_MS ? 'working' : 'idle';
  return {
    id: terminal.id,
    name: terminal.title,
    provider: terminal.provider,
    seat: { room: roomOf(terminal.title, branch), desk },
    state: PERSON_STATES.includes(state) ? state : 'idle',
    branch,
    worktree: terminal.worktree,
    currentTask: task === null ? (card === null ? null : card.title) : task.title,
    issue: issueNumber,
    since: terminal.lastOutputAt === null ? null : new Date(terminal.lastOutputAt).toISOString(),
    lastActivity: terminal.lastOutputAt === null ? null : new Date(terminal.lastOutputAt).toISOString(),
  };
}

/**
 * When Orca is unavailable the office still shows the team from git: one row per worktree, named by its
 * branch. That is derived, not invented — and it is labelled as git-sourced by its null provider.
 * @param {any[]} worktrees
 */
export function peopleFromWorktrees(worktrees) {
  return worktrees.flatMap((w, index) => {
    if (w.bare || typeof w.branch !== 'string') return [];
    return [{
      id: `worktree:${w.path}`,
      name: w.branch,
      provider: null,
      seat: { room: roomOf(null, w.branch), desk: index },
      state: w.dirty === true ? 'working' : w.dirty === false ? 'idle' : 'idle',
      branch: w.branch,
      worktree: w.path,
      currentTask: null,
      issue: issueFromBranch(w.branch),
      since: null,
      lastActivity: null,
    }];
  });
}

/** Desk numbers are per room and stable while the person exists: append order, never sort order. */
function seatPeople(people, previousSeats) {
  const byRoom = new Map();
  for (const person of people) {
    const room = person.seat.room;
    const taken = previousSeats.get(person.id);
    if (taken !== undefined && taken.room === room) {
      byRoom.set(room, Math.max(byRoom.get(room) ?? -1, taken.desk));
      continue;
    }
    const next = (byRoom.get(room) ?? -1) + 1;
    byRoom.set(room, next);
    previousSeats.set(person.id, { room, desk: next });
  }
  for (const person of people) {
    const seat = previousSeats.get(person.id);
    if (seat !== undefined && seat.room === person.seat.room) person.seat = { room: seat.room, desk: seat.desk };
  }
  return people;
}

/**
 * A person's `since` is the moment their CURRENT state began. The sources do not record that, so it is
 * carried from the previous poll: same state → the old value; a changed state → now. On the first poll every
 * person starts at `now`, which is true ("we have known this since we started") rather than a guess.
 */
export function withSince(people, previous, nowIso) {
  const before = new Map((previous?.people ?? []).map((p) => [p.id, p]));
  for (const person of people) {
    const prev = before.get(person.id);
    person.since = prev !== undefined && prev.state === person.state ? prev.since ?? nowIso : nowIso;
  }
  return people;
}

/**
 * Build the state from four answers. `previousSeats` is the server's memory of desk positions (a Map).
 * @param {{ orca: any, tasks: any, git: any, github: any, now: number, runId?: string | null, previousSeats?: Map<string, {room: string, desk: number}>, previous?: any, repo?: string | null }} input
 */
export function buildLiveState(input) {
  const { orca, tasks, git, github, now } = input;
  const previousSeats = input.previousSeats ?? new Map();
  const previous = input.previous ?? null;
  const issues = Array.isArray(github?.issues) ? github.issues : [];
  const prs = Array.isArray(github?.pulls) ? github.pulls : [];
  const cards = new Map(issues.map((i) => [i.number, i]));
  const taskRows = Array.isArray(tasks?.tasks) ? tasks.tasks : [];

  const terminals = Array.isArray(orca?.terminals) ? orca.terminals : [];
  const people = terminals.length > 0
    ? terminals.map((terminal, index) => personFromTerminal(terminal, { now, tasks: taskRows, cards, desk: index }))
    : peopleFromWorktrees(Array.isArray(git?.worktrees) ? git.worktrees : []);
  seatPeople(people, previousSeats);

  const iso = new Date(now).toISOString();
  withSince(people, previous, iso);
  // A source that fails this poll keeps the time it last answered: "stale" is a fact worth showing, and
  // replacing it with null would erase when the office last knew anything.
  const lastOk = (key, ok) => (ok ? iso : previous?.sources?.[key]?.lastOkAt ?? null);
  return {
    updatedAt: iso,
    mode: 'live',
    sources: {
      orca: { ok: orca?.ok === true, error: orca?.error ?? null, lastOkAt: lastOk('orca', orca?.ok === true), terminals: terminals.length },
      tasks: { ok: tasks?.ok === true, error: tasks?.error ?? null, lastOkAt: lastOk('tasks', tasks?.ok === true), run: input.runId ?? null },
      git: { ok: git?.ok === true, error: git?.error ?? null, lastOkAt: lastOk('git', git?.ok === true) },
      github: { ok: github?.ok === true, error: github?.error ?? null, lastOkAt: lastOk('github', github?.ok === true), repo: input.repo ?? null },
    },
    departments: [
      { id: 'lead', name: 'Team Lead', seat: 'lead', room: 'lead' },
      { id: 'qa', name: 'QA', seat: 'qa', room: 'qa' },
      { id: 'sa-systems', name: 'SA · Systems', seat: 'sa-systems', room: 'sa' },
      { id: 'sa-code', name: 'SA · Code', seat: 'sa-code', room: 'sa' },
      { id: 'dev', name: 'Dev lanes', seat: 'dev', room: 'dev' },
      { id: 'release', name: 'Release', seat: 'release', room: 'release' },
    ],
    people,
    board: { lanes: [...BOARD_COLUMNS], issues, prs },
    events: [],
    tick: null,
  };
}

/** Compare two people by the fields the UI draws; `undefined` means "not part of this patch". */
function changedFields(before, after, fields) {
  const changed = {};
  for (const field of fields) {
    if (JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field])) changed[field] = after[field];
  }
  return changed;
}

const PERSON_FIELDS = ['name', 'provider', 'seat', 'state', 'branch', 'worktree', 'currentTask', 'issue', 'since', 'lastActivity'];
const CARD_FIELDS = ['title', 'lane', 'column', 'priority', 'state', 'draft', 'url', 'updatedAt'];

/**
 * The minimum set of patches between two states. An empty array means "nothing to send".
 * @param {any} before
 * @param {any} after
 * @returns {any[]}
 */
export function diffStates(before, after) {
  const patches = [];
  if (before === null || before === undefined) return [{ type: 'tick', at: after.updatedAt, mode: after.mode }];
  for (const key of ['orca', 'tasks', 'git', 'github']) {
    const a = before.sources?.[key];
    const b = after.sources?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) patches.push({ type: 'source', id: key, ...(b ?? {}) });
  }
  if (before.mode !== after.mode) patches.push({ type: 'tick', at: after.updatedAt, mode: after.mode });
  else if (before.updatedAt !== after.updatedAt) patches.push({ type: 'tick', at: after.updatedAt, mode: after.mode });

  const beforePeople = new Map((before.people ?? []).map((p) => [p.id, p]));
  const afterPeople = new Set((after.people ?? []).map((p) => p.id));
  for (const person of after.people ?? []) {
    const prev = beforePeople.get(person.id);
    if (prev === undefined) {
      patches.push({ type: 'person', id: person.id, added: person });
      continue;
    }
    const changed = changedFields(prev, person, PERSON_FIELDS);
    if (Object.keys(changed).length > 0) patches.push({ type: 'person', id: person.id, changed });
  }
  for (const id of beforePeople.keys()) if (!afterPeople.has(id)) patches.push({ type: 'person', id, removed: true });

  for (const kind of ['issues', 'prs']) {
    const prevCards = new Map((before.board?.[kind] ?? []).map((c) => [c.number, c]));
    const nextCards = new Set((after.board?.[kind] ?? []).map((c) => c.number));
    for (const card of after.board?.[kind] ?? []) {
      const prev = prevCards.get(card.number);
      if (prev === undefined) {
        patches.push({ type: 'board', kind: kind === 'issues' ? 'issue' : 'pr', number: card.number, added: card });
        continue;
      }
      const changed = changedFields(prev, card, CARD_FIELDS);
      if (Object.keys(changed).length > 0) patches.push({ type: 'board', kind: kind === 'issues' ? 'issue' : 'pr', number: card.number, changed });
    }
    for (const number of prevCards.keys()) if (!nextCards.has(number)) patches.push({ type: 'board', kind: kind === 'issues' ? 'issue' : 'pr', number, removed: true });
  }
  return patches;
}

/**
 * Poll every source in parallel. Never rejects: a source that fails is an `ok:false` answer with a redacted
 * sentence, and the other sources still arrive.
 * @param {{ cwd: string, orcaCommand?: string, ghCommand?: string, gitCommand?: string, repo?: string | null, runId?: string | null, timeoutMs?: number }} options
 */
export async function poll({ cwd, orcaCommand, ghCommand, gitCommand, repo = null, runId = null, timeoutMs }) {
  const [orca, tasks, git, github] = await Promise.all([
    readTerminals({ command: orcaCommand, timeoutMs }).catch((e) => ({ ok: false, error: redact(String(e?.message ?? e)), terminals: [] })),
    readTasks({ command: orcaCommand, runId: runId ?? '', timeoutMs }).catch((e) => ({ ok: false, error: redact(String(e?.message ?? e)), tasks: [] })),
    readGit({ cwd, command: gitCommand, timeoutMs }).catch((e) => ({ ok: false, error: redact(String(e?.message ?? e)), worktrees: [] })),
    readBoard({ command: ghCommand, repo, cwd, timeoutMs }).catch((e) => ({ ok: false, error: redact(String(e?.message ?? e)), issues: [], pulls: [] })),
  ]);
  return { orca, tasks, git, github };
}