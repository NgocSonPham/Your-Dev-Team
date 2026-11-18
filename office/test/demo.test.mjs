import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoState, DEMO_EPOCH, TICK_MS, DEMO_SEED, mulberry32 } from '../lib/demo.mjs';

test('the same tick is byte-identical across two fresh calls', () => {
  for (const tick of [0, 1, 7, 41, 240]) {
    assert.equal(JSON.stringify(demoState(tick)), JSON.stringify(demoState(tick)));
  }
});

test('a different tick is a different office', () => {
  assert.notEqual(JSON.stringify(demoState(3)), JSON.stringify(demoState(4)));
});

test('the demo clock is virtual: no wall clock, no Math.random', () => {
  const state = demoState(5);
  assert.equal(state.updatedAt, new Date(DEMO_EPOCH + 5 * TICK_MS).toISOString());
  // Calling it twice a minute apart in real time cannot change the answer — proven by the first test, and by not
  // reading Date.now here at all.
  assert.equal(mulberry32(DEMO_SEED)(), mulberry32(DEMO_SEED)());
});

test('the cast, rooms and board are complete', () => {
  const state = demoState(0);
  assert.equal(state.mode, 'demo');
  assert.ok(state.people.length >= 8);
  assert.deepEqual(new Set(state.people.map((p) => p.seat.room)), new Set(['lead', 'qa', 'sa', 'dev', 'release']));
  assert.ok(state.board.issues.length >= 10);
  assert.ok(state.board.prs.length >= 3);
  assert.deepEqual(new Set(state.people.map((p) => p.state)), new Set(['working', 'reviewing', 'idle', 'blocked']));
  for (const person of state.people) {
    for (const key of ['id', 'name', 'provider', 'seat', 'state', 'branch', 'worktree', 'currentTask', 'issue', 'since', 'lastActivity']) {
      assert.ok(key in person, `${person.id} is missing ${key}`);
    }
  }
});

test('a demo never claims a live source', () => {
  const state = demoState(12);
  assert.equal(state.mode, 'demo');
  for (const source of Object.values(state.sources)) {
    assert.notEqual(source.error, 'live');
  }
});

test('issues advance columns over time while their owner lane stays put', () => {
  const first = demoState(0).board.issues;
  const later = demoState(24).board.issues;
  assert.notDeepEqual(first.map((i) => i.column), later.map((i) => i.column));
  assert.deepEqual(first.map((i) => i.lane), later.map((i) => i.lane), 'the owner lane is not what moves');
  assert.ok(later.every((i) => demoState(24).board.lanes.includes(i.column)));
});

test('every demo state is reachable, including offline', () => {
  const states = new Set();
  for (let tick = 0; tick < 60; tick += 1) for (const person of demoState(tick).people) states.add(person.state);
  for (const state of ['working', 'reviewing', 'idle', 'blocked', 'offline']) assert.ok(states.has(state), `${state} never appears`);
});