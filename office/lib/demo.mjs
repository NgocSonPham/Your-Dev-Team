/**
 * Demo — a first-class office, not a fallback.
 *
 * Determinism is the contract: the state is a pure function of the TICK, a seeded PRNG and literal data.
 * Nothing here reads `Date.now()`, `Math.random()` or the environment, so two fresh processes asked for the
 * same tick produce byte-identical JSON — which is what the test asserts, and what lets a screenshot taken
 * today match the one in the README.
 *
 * The cast and the board are marked `demo` everywhere they surface: `mode:'demo'` in the state, in
 * `/api/health`, and in the UI banner. This module is never imported by the live path.
 */
import { COLUMNS } from './sources/github.mjs';

export const DEMO_SEED = 0x0ff1ce;
export const TICK_MS = 1500;
/** A fixed point in time; tick n is EPOCH + n * TICK_MS. Never `Date.now()`. */
export const DEMO_EPOCH = Date.UTC(2026, 10, 17, 13, 0, 0);

/** mulberry32 — 32-bit, seeded, identical on every engine. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The six rooms the brief names. A person's desk is stable and never re-sorted. */
export const DEMO_DEPARTMENTS = [
  { id: 'lead', name: 'Team Lead', seat: 'lead', room: 'lead' },
  { id: 'qa', name: 'QA', seat: 'qa', room: 'qa' },
  { id: 'sa-systems', name: 'SA · Systems', seat: 'sa-systems', room: 'sa' },
  { id: 'sa-code', name: 'SA · Code', seat: 'sa-code', room: 'sa' },
  { id: 'dev', name: 'Dev lanes', seat: 'dev', room: 'dev' },
  { id: 'release', name: 'Release', seat: 'release', room: 'release' },
];

/** Fixed cast. `desk` is the position inside the room; `lane` is what they are working on. */
const CAST = [
  { id: 'p-lead', name: 'LEAD | xqa', provider: 'Claude', room: 'lead', desk: 0, lane: 'triage', owns: null },
  { id: 'p-qa', name: 'OC | QA 1', provider: 'QA', room: 'qa', desk: 0, lane: 'verify', owns: null },
  { id: 'p-sa1', name: 'SA | Systems 1', provider: 'Claude', room: 'sa', desk: 0, lane: 'spec', owns: null },
  { id: 'p-sa2', name: 'SA | Code 1', provider: 'Claude', room: 'sa', desk: 1, lane: 'spec', owns: null },
  { id: 'p-d1', name: 'OC | DeepSeek 1', provider: 'DeepSeek', room: 'dev', desk: 0, lane: 'build', owns: 0 },
  { id: 'p-d2', name: 'OC | DeepSeek 2', provider: 'DeepSeek', room: 'dev', desk: 1, lane: 'build', owns: 1 },
  { id: 'p-d3', name: 'OC | Kimi 1', provider: 'Kimi', room: 'dev', desk: 2, lane: 'build', owns: 2 },
  { id: 'p-d4', name: 'CLAUDE | Lane 4', provider: 'Claude', room: 'dev', desk: 3, lane: 'build', owns: 3 },
  { id: 'p-d5', name: 'OC | Qwen 1', provider: 'Qwen', room: 'dev', desk: 4, lane: 'build', owns: 4 },
  { id: 'p-rel', name: 'OC | Release 1', provider: 'DeepSeek', room: 'release', desk: 0, lane: 'merge', owns: null },
];

const ISSUE_TITLES = [
  'Office: the wall board hides the office',
  'Office: a status ring for every worker',
  'Issue flow: a lane label that nobody owns',
  'Run engine: replay a full attempt from its events',
  'Fixtures: a signed-out account with no session',
  'Data set: a key that is generated twice',
  'Generation: the writer drops a datascript field',
  'Scan: a page with two identical headings',
  'Review: a verdict with no evidence',
  'Release: verify the mirror after a sync',
  'Tests: a spec that cannot fail',
  'Docs: the office README is the only setup guide',
];

const PR_TITLES = [
  'feat(office): the wall board, first cut',
  'fix(office): a token in a title is redacted',
  'feat(office): rooms and desks',
  'chore(office): the sync list includes office',
];

/** How many ticks a card spends in a lane before it advances. Offset per card so they do not move together. */
const ADVANCE_EVERY = 8;

/** The lane a card is in at `tick`. Deterministic, no state carried between calls. */
function laneAt(index, tick, lanes) {
  const steps = Math.floor((tick + index * 3) / ADVANCE_EVERY);
  return lanes[steps % lanes.length];
}

/**
 * The whole demo office for one tick.
 * @param {number} tick  non-negative integer, the only input
 * @param {number} [seed]
 */
export function demoState(tick, seed = DEMO_SEED) {
  const t = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  const rand = mulberry32(seed);
  const at = new Date(DEMO_EPOCH + t * TICK_MS).toISOString();
  const lanes = COLUMNS.filter((l) => l !== 'unknown');

  const OWNER_LANES = ['dev', 'qa', 'sa', 'dev', 'dev'];
  const issues = ISSUE_TITLES.map((title, i) => {
    const column = laneAt(i, t, lanes);
    return {
      number: 101 + i,
      title,
      // The owner lane is who the card belongs to (`lane:*`); the column is where it sits.
      lane: OWNER_LANES[i % OWNER_LANES.length],
      column,
      priority: `P${(i % 4).toString()}`,
      state: column === 'merge' && (t + i) % 24 < 4 ? 'merged' : column === 'build' && i === 4 ? 'blocked' : 'open',
      url: null,
      updatedAt: new Date(DEMO_EPOCH + (t - ((t + i * 3) % ADVANCE_EVERY)) * TICK_MS).toISOString(),
    };
  });

  const prs = PR_TITLES.map((title, i) => {
    const column = i === 0 ? 'review' : i === 1 ? 'verify' : i === 2 ? 'build' : 'merge';
    return {
      number: 200 + i,
      title,
      lane: 'dev',
      column,
      priority: `P${(i % 3).toString()}`,
      state: i === 3 ? 'draft' : 'open',
      draft: i === 3,
      url: null,
      updatedAt: at,
    };
  });

  const people = CAST.map((person, i) => {
    const issue = person.owns === null ? null : issues[person.owns];
    // A person's state follows THEIR desk role, not whichever card happens to sit in their lane — otherwise a
    // whole room would change state together and the office would read as a test pattern.
    const roleColumn = person.owns === null ? person.lane : issue.column;
    // Two scripted beats, so all five states are visible at any tick: a blocked dev and an offline one.
    const blocked = person.id === 'p-d2' && t % 30 < 12;
    const offline = person.id === 'p-d5' && t % 40 >= 32;
    const reviewing = roleColumn === 'review' || roleColumn === 'verify';
    const working = roleColumn === 'build' || roleColumn === 'spec' || roleColumn === 'triage';
    const state = offline ? 'offline' : blocked ? 'blocked' : reviewing ? 'reviewing' : working ? 'working' : 'idle';
    const activitySeed = (rand() * 1000) | 0; // consumed per person, per tick: keeps the sequence stable
    return {
      id: person.id,
      name: person.name,
      provider: person.provider,
      seat: { room: person.room, desk: person.desk },
      state,
      branch: issue === null ? null : `${person.lane === 'build' ? 'feat' : person.lane === 'verify' ? 'test' : 'docs'}/${(person.id || 'lane').replace(/^p-/u, '')}-${issue.number}`,
      worktree: issue === null ? null : `.scratch/wt-${person.id.replace(/^p-/u, '')}`,
      currentTask: issue === null ? null : issue.title,
      issue: issue === null ? null : issue.number,
      since: new Date(DEMO_EPOCH + Math.max(0, t - (activitySeed % 40)) * TICK_MS).toISOString(),
      lastActivity: new Date(DEMO_EPOCH + t * TICK_MS - (activitySeed % 7) * 1000).toISOString(),
    };
  });

  // Events are derived from the same clock: an advance inside the last 50 ticks, plus one per blocked window.
  const events = [];
  const seen = new Set();
  for (let step = Math.max(0, t - 50); step <= t; step += 1) {
    ISSUE_TITLES.forEach((title, i) => {
      if ((step + i * 3) % ADVANCE_EVERY !== 0) return;
      const lane = laneAt(i, step, lanes);
      const key = `${i}:${lane}:${step}`;
      if (seen.has(key)) return;
      seen.add(key);
      events.push({
        at: new Date(DEMO_EPOCH + step * TICK_MS).toISOString(),
        type: 'issue',
        issue: 101 + i,
        detail: `${title} → ${lane}`,
      });
    });
  }
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const last = events.slice(-50);

  return {
    updatedAt: at,
    mode: 'demo',
    sources: {
      orca: { ok: true, error: null, lastOkAt: at, terminals: people.length },
      tasks: { ok: true, error: null, lastOkAt: at, run: 'demo' },
      git: { ok: true, error: null, lastOkAt: at },
      github: { ok: true, error: null, lastOkAt: at, repo: 'demo/office' },
    },
    departments: DEMO_DEPARTMENTS.map((d) => ({ ...d })),
    people,
    board: { lanes: [...COLUMNS], issues, prs },
    events: last,
    tick: t,
  };
}