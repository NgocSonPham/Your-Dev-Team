/**
 * The office page — one state, two views.
 *
 * Plain ES modules, no framework, no build. The server sends a full `state` once and then minimal `patch`
 * events; this file applies a patch to the in-memory state and touches only the DOM that changed, so a
 * status ring can animate without the room being rebuilt every 1.5 s.
 */

const ROOMS = [
  { id: 'lead', name: 'Team Lead' },
  { id: 'qa', name: 'QA' },
  { id: 'sa', name: 'SA · Systems & Code' },
  { id: 'dev', name: 'Dev lanes' },
  { id: 'release', name: 'Release' },
];

const STATE_LABELS = {
  working: 'working',
  reviewing: 'reviewing',
  idle: 'idle',
  blocked: 'blocked',
  offline: 'offline',
};

/** @type {any} */
let state = null;
/** id → desk element, so a patch updates one desk. */
const desks = new Map();
/** `kind:number` → card element. */
const cards = new Map();
/** The active status filter: a Set of person states, or null for all. */
let filter = null;

const $ = (id) => document.getElementById(id);

const initials = (name) =>
  String(name ?? '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/u)
    .filter((w) => w !== '' && w.toLowerCase() !== 'xqa')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '··';

const time = (iso) => {
  if (typeof iso !== 'string') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const ago = (iso) => {
  if (typeof iso !== 'string') return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  if (ms < 5_000) return 'now';
  if (ms < 60_000) return `${String(Math.floor(ms / 1000))}s`;
  if (ms < 3_600_000) return `${String(Math.floor(ms / 60_000))}m`;
  return `${String(Math.floor(ms / 3_600_000))}h`;
};

/* ── Rendering ───────────────────────────────────────────────────────────── */

function roomElement(id) {
  let room = document.querySelector(`.room[data-room="${id}"]`);
  if (room !== null) return room;
  const meta = ROOMS.find((r) => r.id === id) ?? { id, name: id };
  room = document.createElement('section');
  room.className = 'room';
  room.dataset.room = id;
  room.innerHTML = `
    <div class="room-head"><h2></h2><span class="count"></span></div>
    <div class="desks"></div>`;
  room.querySelector('h2').textContent = meta.name;
  const host = $('rooms');
  // Keep the fixed room order regardless of arrival order.
  const after = ROOMS.slice(ROOMS.findIndex((r) => r.id === id) + 1);
  const next = after.map((r) => host.querySelector(`.room[data-room="${r.id}"]`)).find((el) => el !== null);
  host.insertBefore(room, next ?? null);
  return room;
}

function personDesk(person) {
  let desk = desks.get(person.id);
  if (desk === undefined) {
    desk = document.createElement('article');
    desk.className = 'desk';
    desk.dataset.id = person.id;
    desk.innerHTML = `
      <div class="monitor"><span></span></div>
      <div class="person">
        <div class="avatar" aria-hidden="true"></div>
        <div class="person-text">
          <span class="person-name"></span>
          <span class="person-sub"></span>
        </div>
      </div>
      <div class="activity"></div>
      <span class="lamp" aria-hidden="true"></span>`;
    desks.set(person.id, desk);
  }
  desk.dataset.state = person.state;
  desk.querySelector('.avatar').textContent = initials(person.name);
  desk.querySelector('.person-name').textContent = person.name ?? '—';
  const sub = [person.provider, person.branch].filter((x) => typeof x === 'string' && x !== '').join(' · ');
  desk.querySelector('.person-sub').textContent = sub === '' ? '—' : sub;
  desk.querySelector('.monitor span').textContent = person.worktree ?? person.branch ?? 'no terminal';
  desk.querySelector('.activity').textContent = person.currentTask ?? (person.issue === null ? '—' : `issue #${String(person.issue)}`);
  desk.title = [
    person.name,
    `state: ${STATE_LABELS[person.state] ?? person.state} since ${time(person.since)}`,
    person.branch === null ? null : `branch: ${person.branch}`,
    person.worktree === null ? null : `worktree: ${person.worktree}`,
    person.currentTask === null ? 'activity: —' : `activity: ${person.currentTask}`,
    person.lastActivity === null ? null : `last output: ${ago(person.lastActivity)} ago`,
  ].filter(Boolean).join('\n');
  desk.setAttribute('aria-label', `${person.name}, ${STATE_LABELS[person.state] ?? person.state}` + (person.currentTask === null ? '' : `, ${person.currentTask}`));
  return desk;
}

function renderPeople() {
  if (state === null) return;
  const host = $('rooms');
  const byRoom = new Map(ROOMS.map((r) => [r.id, []]));
  for (const person of state.people ?? []) {
    const room = byRoom.has(person.seat?.room) ? person.seat.room : 'dev';
    byRoom.get(room).push(person);
  }
  for (const [roomId, people] of byRoom) {
    const room = roomElement(roomId);
    const desksHost = room.querySelector('.desks');
    const visible = filter === null ? people : people.filter((p) => filter.has(p.state));
    const wanted = new Set(visible.map((p) => p.id));
    for (const person of visible) desksHost.append(personDesk(person));
    // Desks are keyed by person: append moves an existing node, so no duplicate is created. Remove the rest.
    for (const [id, desk] of desks) {
      if (!wanted.has(id) && desk.parentElement === desksHost) desk.remove();
    }
    room.querySelector('.count').textContent = `${String(visible.length)}${filter === null ? '' : ` / ${String(people.length)}`}`;
  }
  host.hidden = false;
  const empty = (state.people ?? []).length === 0;
  $('officeEmpty').hidden = !empty;
}

function cardElement(kind, card) {
  const key = `${kind}:${String(card.number)}`;
  let el = cards.get(key);
  if (el === undefined) {
    el = document.createElement('article');
    el.className = 'card';
    el.dataset.key = key;
    el.innerHTML = `
      <div class="card-top"><span class="p"></span><span class="num"></span><span class="lane-tag"></span><span class="kind"></span></div>
      <div class="title"></div>`;
    cards.set(key, el);
    // A card that appeared while the board is open gets the one animation the brief asks for.
    if (boardOpen()) {
      el.classList.add('is-new');
      setTimeout(() => el.classList.remove('is-new'), 1200);
    }
  }
  el.dataset.priority = card.priority ?? '';
  el.dataset.state = card.state ?? '';
  el.querySelector('.num').textContent = `#${String(card.number)}`;
  el.querySelector('.kind').textContent = kind === 'pr' ? 'PR' : 'issue';
  const laneTag = el.querySelector('.lane-tag');
  laneTag.textContent = card.lane ?? '—';
  laneTag.hidden = card.lane === null || card.lane === undefined;
  el.querySelector('.title').textContent = card.title ?? '—';
  el.title = `${kind === 'pr' ? 'PR' : 'Issue'} #${String(card.number)} · ${card.column ?? 'unknown'}${card.lane === null ? '' : ` · lane ${card.lane}`}${card.url === null ? '' : `\n${card.url}`}`;
  return el;
}

function laneName(id) {
  return id === 'unknown' ? 'Unassigned' : id.charAt(0).toUpperCase() + id.slice(1);
}

function laneColumn(lane, items) {
  const column = document.createElement('div');
  column.className = 'lane';
  column.dataset.lane = lane;
  column.innerHTML = `<h3><span>${laneName(lane)}</span><span class="n">${String(items.length)}</span></h3>`;
  for (const { kind, card } of items) column.append(cardElement(kind, card));
  return column;
}

function renderBoard() {
  if (state === null) return;
  // `unknown` is drawn last, whatever order the server sends: it is "shown, never dropped".
  const lanes = (state.board?.lanes ?? []).filter((l) => l !== 'unknown');
  const all = [
    ...(state.board?.issues ?? []).map((card) => ({ kind: 'issue', card })),
    ...(state.board?.prs ?? []).map((card) => ({ kind: 'pr', card })),
  ];
  const host = $('lanes');
  host.textContent = '';
  for (const lane of lanes) host.append(laneColumn(lane, all.filter((x) => x.card.column === lane)));
  const extra = all.filter((x) => !lanes.includes(x.card.column));
  if (extra.length > 0) host.append(laneColumn('unknown', extra));
  const repo = state.sources?.github?.repo ?? null;
  $('boardRepo').textContent = repo === null ? 'no board source' : repo;
}

function renderBanner() {
  const banner = $('banner');
  const parts = [];
  const names = { orca: 'Orca', tasks: 'Orca tasks', git: 'git', github: 'GitHub' };
  for (const [key, label] of Object.entries(names)) {
    const source = state?.sources?.[key];
    if (source === undefined || source.ok === true) continue;
    const reason = source.error === null || source.error === undefined ? 'unavailable' : source.error;
    const stale = source.lastOkAt === null || source.lastOkAt === undefined ? '' : ` (last read ${time(source.lastOkAt)})`;
    parts.push(`<span><strong>${label}</strong> ${escapeHtml(reason)}${escapeHtml(stale)}</span>`);
  }
  if (state?.mode === 'demo') {
    parts.unshift('<span><strong>Demo</strong> a simulated office — no Orca, no git, no GitHub</span>');
  }
  banner.hidden = parts.length === 0;
  banner.innerHTML = parts.join('<span class="sep">·</span>');
}

function renderMode() {
  const chip = $('modeChip');
  const mode = state?.mode ?? 'live';
  chip.dataset.mode = mode;
  chip.textContent = mode === 'demo' ? 'demo' : 'live';
  chip.title = mode === 'demo' ? 'A deterministic simulated office' : 'Read from Orca, git and GitHub on this machine';
  $('updated').textContent = state?.updatedAt === undefined ? '—' : `${time(state.updatedAt)}`;
  const people = state?.people ?? [];
  const counts = ['working', 'reviewing', 'idle', 'blocked', 'offline']
    .map((s) => `${String(people.filter((p) => p.state === s).length)} ${s}`)
    .join(' · ');
  $('counts').textContent = `${String(people.length)} people · ${counts}`;
  const events = state?.events ?? [];
  const last = events[events.length - 1];
  $('ticker').textContent = last === undefined ? 'waiting for the first event…' : `${time(last.at)} · ${last.detail ?? last.type}`;
}

function renderFilters() {
  const host = $('filters');
  if (host.dataset.built === '1') return;
  host.dataset.built = '1';
  const states = ['working', 'reviewing', 'idle', 'blocked', 'offline'];
  for (const s of states) {
    const b = document.createElement('button');
    b.className = 'filter';
    b.type = 'button';
    b.dataset.state = s;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="dot"></span>${s}`;
    b.addEventListener('click', () => {
      if (filter === null) filter = new Set([s]);
      else if (filter.has(s)) filter.delete(s);
      else filter.add(s);
      if (filter !== null && filter.size === 0) filter = null;
      for (const other of host.querySelectorAll('.filter')) {
        other.setAttribute('aria-pressed', filter !== null && filter.has(other.dataset.state) ? 'true' : 'false');
      }
      renderPeople();
    });
    host.append(b);
  }
}

function renderEvents() {
  const host = $('events');
  const events = [...(state?.events ?? [])].slice(-12).reverse();
  host.textContent = '';
  if (events.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Nothing has changed yet.';
    host.append(li);
    return;
  }
  for (const event of events) {
    const li = document.createElement('li');
    const t = document.createElement('time');
    t.textContent = time(event.at);
    li.append(t, document.createTextNode(event.detail ?? event.type));
    host.append(li);
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderAll() {
  renderMode();
  renderBanner();
  renderFilters();
  renderPeople();
  renderBoard();
  renderEvents();
}

/* ── View switching ──────────────────────────────────────────────────────── */

function boardOpen() {
  return !$('board').hidden;
}

function setView(view) {
  const isBoard = view === 'board';
  document.body.dataset.view = isBoard ? 'board' : 'office';
  $('board').hidden = !isBoard;
  $('office').setAttribute('aria-hidden', isBoard ? 'true' : 'false');
  for (const [id, selected] of [['tabOffice', !isBoard], ['tabBoard', isBoard]]) {
    const tab = $(id);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  }
  if (isBoard) renderBoard();
  else renderPeople();
  // Move focus to the view that was opened, so a keyboard user is where they asked to be.
  $(isBoard ? 'board' : 'office').focus?.({ preventScroll: true });
}

/* ── Patching ────────────────────────────────────────────────────────────── */

function applyPatch(patch) {
  if (state === null) return;
  if (patch.type === 'tick') {
    state.updatedAt = patch.at;
    if (patch.mode !== undefined) state.mode = patch.mode;
    renderMode();
    return;
  }
  if (patch.type === 'source') {
    const { type, id, ...rest } = patch;
    state.sources = { ...state.sources, [id]: { ...(state.sources?.[id] ?? {}), ...rest } };
    renderBanner();
    return;
  }
  if (patch.type === 'person') {
    const list = state.people ?? [];
    const index = list.findIndex((p) => p.id === patch.id);
    if (patch.removed === true) {
      if (index >= 0) list.splice(index, 1);
      const desk = desks.get(patch.id);
      if (desk !== undefined) desk.remove();
      desks.delete(patch.id);
      renderMode();
      return;
    }
    if (patch.added !== undefined) {
      if (index >= 0) list[index] = patch.added;
      else list.push(patch.added);
    } else if (index >= 0) {
      list[index] = { ...list[index], ...(patch.changed ?? {}) };
    }
    renderPeople();
    renderMode();
    return;
  }
  if (patch.type === 'board') {
    const key = patch.kind === 'pr' ? 'prs' : 'issues';
    const list = state.board[key] ?? [];
    const index = list.findIndex((c) => c.number === patch.number);
    if (patch.removed === true) {
      if (index >= 0) list.splice(index, 1);
      const el = cards.get(`${patch.kind}:${String(patch.number)}`);
      if (el !== undefined) el.remove();
      cards.delete(`${patch.kind}:${String(patch.number)}`);
    } else if (patch.added !== undefined) {
      if (index >= 0) list[index] = patch.added;
      else list.push(patch.added);
    } else if (index >= 0) {
      const before = list[index].column;
      list[index] = { ...list[index], ...(patch.changed ?? {}) };
      if (before !== list[index].column) cards.get(`${patch.kind}:${String(patch.number)}`)?.classList.add('is-new');
    }
    renderBoard();
  }
}

/* ── Boot ────────────────────────────────────────────────────────────────── */

async function loadState() {
  try {
    const res = await fetch('/api/state', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`state ${String(res.status)}`);
    state = await res.json();
    renderAll();
  } catch {
    // The stream will try again; a failed first read must not blank the page.
    $('ticker').textContent = 'cannot reach the office API — retrying';
  }
}

function connect() {
  const source = new EventSource('/api/events');
  source.addEventListener('state', async (event) => {
    state = JSON.parse(event.data);
    desks.clear();
    cards.clear();
    $('rooms').textContent = '';
    renderAll();
  });
  source.addEventListener('patch', (event) => {
    try {
      applyPatch(JSON.parse(event.data));
    } catch {
      /* a malformed frame is ignored; the next full state repairs the view */
    }
  });
  source.addEventListener('open', () => {
    if (state === null) void loadState();
  });
  source.addEventListener('error', () => {
    $('ticker').textContent = 'stream interrupted — reconnecting';
  });
}

$('tabOffice').addEventListener('click', () => setView('office'));
$('tabBoard').addEventListener('click', () => setView('board'));
$('boardClose').addEventListener('click', () => setView('office'));
$('office').tabIndex = -1;
$('board').tabIndex = -1;
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && boardOpen()) setView('office');
  if (event.key === 'b' && !event.metaKey && !event.ctrlKey && !(event.target instanceof HTMLInputElement)) setView(boardOpen() ? 'office' : 'board');
});

void loadState().then(connect);