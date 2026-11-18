# Office — plan (feat/office-ui)

A local, realtime virtual office for **Your Dev Team**. Node-only, no runtime dependencies, no build step.
Source of truth: `office/` in this repository; the public mirror only receives it through `npm run sync:dev-team`.

Baseline: `946dc97b3` (branch `feat/office-ui`, based on `docs/issue-lifecycle`).
Brief: `.scratch/office-brief.md`. Visual references (local, not shipped):
`V-01 · Wall board expanded` and `V-06 · Decorate · Cozy evening`.

---

## 1. What the office shows, and what it deliberately does not

**Shows.** Departments as rooms, desks as seats, one person per Orca terminal / worktree, a status ring and
one line of activity each; a wall board of issues and PRs by lane; the board can overlay the office (V-01) or
be dismissed (V-06). Live changes arrive over SSE within ~2 s. A mode banner says `live` or `demo`, and a
source banner names every source that could not be read.

**Does not show.** Raw terminal output, prompts, logs, diffs, commit bodies, file contents, `.env`, credentials,
e-mail addresses, URLs with tokens, or anything read from inside a worktree other than `git status --porcelain`
(file *count* only). No history, no trends, no second source of truth: the office never writes to Orca, git or
GitHub. A field that cannot be derived is `null` and the UI prints `—`; nothing is guessed.

**People are terminals/workers, not humans.** The UI states that in the banner and the legend.

---

## 2. State model and the source → field mapping

```ts
OfficeState = {
  updatedAt: string,                    // ISO, when the last successful poll finished
  mode: 'live' | 'demo',
  sources: {                            // one entry per adapter; the UI banner reads these
    orca:   { ok: boolean, error: string | null, lastOkAt: string | null, terminals: number },
    tasks:  { ok: boolean, error: string | null, lastOkAt: string | null, run: string | null },
    git:    { ok: boolean, error: string | null, lastOkAt: string | null },
    github: { ok: boolean, error: string | null, lastOkAt: string | null, repo: string | null }
  },
  departments: [{ id, name, seat, room }],           // fixed table (§2a)
  people: [{
    id, name, provider, seat: { room, desk },
    state: 'working'|'reviewing'|'idle'|'blocked'|'offline',
    branch, worktree, currentTask, issue, since, lastActivity
  }],
  board: {
    lanes: string[],                                  // ordered, §2b
    issues: [{ number, title, lane, priority, state, url, updatedAt }],
    prs:    [{ number, title, lane, priority, state, draft, url, updatedAt }]
  },
  events: [{ at, type, personId?, issue?, detail }]   // last 50, session only (never persisted)
}
```

Every field is copied through an explicit **whitelist mapper**; no external object is ever spread into state.

### 2a. Seats and departments (fixed, not derived)

| room | department | desk rule |
|---|---|---|
| `lead` | Team Lead | the lead terminal, when present |
| `qa` | QA | lane `qa` or a `QA` title |
| `sa-systems` / `sa-code` | SA · Systems / SA · Code | SA titles, split by the branch or title suffix |
| `dev` | Dev lanes | one desk per worktree, ordered by branch name |
| `release` | Release | `main`/`develop` worktrees and release terminals |

Seat assignment is **stable**: a person keeps their desk while they exist; a new desk is appended, never
re-sorted, so the office does not reshuffle on every poll.

### 2b. Lane vocabulary (from the repo's own issue flow)

`scripts/issue-flow.mjs` already defines the labels: `lane:<name>` (free-form, `--lane`, with `lane:tbd` as
"unassigned"), `status:ready-to-merge`, `status:merged`, `gate:*`, `blocked`, `P0…P3`.

**Two vocabularies, deliberately not merged.** A card has an **owner lane** (the `lane:*` label: who it belongs
to — dev, qa, sa) and a **column** (the status progression `triage → spec → build → verify → review → merge`).
The board groups by column and prints the owner lane on the card. Treating the label as the column was the
first cut and it was wrong: the repo's lanes are owners, not stages. A label outside the table keeps the card in
`unknown` — shown, never dropped.

### 2c. Sources (measured against this machine, Orca 1.4.198)

| Source | Command | Fields used |
|---|---|---|
| Orca terminals | `orca --json terminal list --limit 200` | `result.terminals[]`: `handle`, `title`, `branch`, `worktreePath`, `connected`, `lastOutputAt`, `orphaned`. **`preview` is read by nothing, ever.** |
| Orca tasks (optional) | `orca --json orchestration task-list --run <id>` | `id`, `title`, `status`, `assignee`/`terminal` when present, `updatedAt` |
| Git | `git worktree list --porcelain`, `git rev-parse --abbrev-ref HEAD`, `git status --porcelain` per worktree | worktree path, branch, detached/clean |
| GitHub (optional) | `gh issue list --limit 50 --json number,title,state,labels,updatedAt`; `gh pr list --limit 30 --json number,title,state,isDraft,headRefName,labels,updatedAt` | board rows |

**Measured constraints that shape the plan (2026-11-17, Orca 1.4.198):**

- `--json` must come **before** the subcommand: `orca --json terminal list` parses; `orca terminal list --json`
  does not. The adapter uses the first form.
- `orca --json orchestration task-list` answers `run_required` — a task list needs a **bound Run**, and the
  office must never bind one (that would mutate orchestration state). It therefore reads tasks only when the
  user passes a Run id (`--run <id>` / `OFFICE_ORCA_RUN`), and otherwise reports `tasks.ok:false` with that
  sentence. `orchestration run-list`, `worker-list`, `worktree list|ps` are listed by `orca --help` but answer
  `invalid_argument` on this build — **not used**.
- `gh` is authenticated here (account `NgocSonPham`, scopes `repo`), `gh issue list` answers `[]` (no issues
  in this repository), `gh pr list` answers rows. The board must therefore treat "empty" as a real answer, not
  a failure, and name the repo it read.

**Derivation rules.** `state`: `working` when the terminal is connected and its `lastOutputAt` is within 90 s;
`reviewing` when the person's board item is in `review`/`verify`; `blocked` when the issue carries `blocked`;
`offline` when not connected or orphaned; `idle` otherwise. `currentTask` = the Orca task title when a Run is
selected, else the issue title in the person's lane, else `null`. `provider` = the terminal title prefix
(`OC | DeepSeek 1` → `DeepSeek`); an unknown prefix stays `null`. Where a person has no terminal, they are not
shown — the office shows terminals, not branch guesses.

---

## 3. API and SSE shapes

| Route | Answer |
|---|---|
| `GET /` | `office/public/index.html` |
| `GET /assets/*` | files under `office/public/` only (normalised, prefix-checked) |
| `GET /api/state` | the full `OfficeState`, `application/json`, `Cache-Control: no-store` |
| `GET /api/events` | SSE: `event: state` once on connect, then `event: patch` per change, `: ping` every 15 s |
| `GET /api/health` | `{ ok, mode, uptimeMs, sources }` — for the README's troubleshooting |

`patch` payloads are minimal and additive:

```
{ type: 'person',  id, changed: { state, currentTask, lastActivity } }
{ type: 'person',  id, added: {...} }          // a desk appeared
{ type: 'person',  id, removed: true }
{ type: 'board',   kind: 'issue'|'pr', number, changed: {...}, added|null, removed }
{ type: 'source',  id: 'orca'|'tasks'|'git'|'github', ok, error, lastOkAt }
{ type: 'tick',    at, mode }
```

The client keeps the previous state, applies patches, and on `EventSource.onerror` reconnects (the browser
does that) and on reopen asks `/api/state` — a missed patch can never leave a stale office.

Poll cadence: 1500 ms (`--interval <ms>`, min 500). A poll is diffed against the previous state; no change →
no event. Sources are polled in parallel with a 10 s per-command timeout, and a failing source never rejects
the poll.

---

## 4. Demo mode, and how it stays deterministic

`npm run office -- --demo` runs a **simulated** office with no subprocess and no clock dependency:

- A fixed cast (1 lead, 1 QA, 2 SA, 5 dev, 1 release), fixed departments and a fixed issue set (12 issues,
  4 PRs) — literal data in `lib/demo.mjs`, clearly marked `demo`.
- A **seeded** PRNG (`mulberry32`, seed `0x0FF1CE`, overridable with `--seed`) and a **virtual clock**: tick
  *n* is `DEMO_EPOCH + n × 1500 ms`; nothing reads `Date.now()` for state, so two runs at different real
  times produce byte-identical state for the same tick.
- A scripted progression: every 8 ticks an issue advances a lane; a dev's state follows the issue (working →
  reviewing → idle); one person is `blocked` for a fixed window each cycle so the red lamp is demonstrable.
- Demo data is never mixed with live data: `--demo` and live sources are mutually exclusive, and the banner
  says `demo` in the UI and in `/api/health`.

Determinism is a test (§7): the first 40 ticks of two fresh processes must serialise identically.

---

## 5. Privacy, redaction and the threat model

**Assets:** the local machine's terminal metadata, branch names, issue titles, and the fact that a developer
is working on something. Nothing else is read.

**Threats.** (1) A terminal preview containing a secret reaches the browser. (2) A crafted path escapes
`office/public`. (3) An external page reads the API (CSRF/DNS-rebinding). (4) A committed file carries a secret
or a real e-mail. (5) A screenshot or demo dataset leaks an identity.

**Rules (each is a test):**

1. **No preview, ever.** The Orca adapter maps a fixed field list; `preview`, `ptyId`, `incarnationId` are
   never copied. The state serialiser is asserted not to contain the fake token planted in a fake preview.
2. **Redaction on every free-text field** (`title`, `currentTask`, `branch`, `error`): API keys (`sk-…`,
   `ghp_…`, `gho_…`, `github_pat_…`, `AKIA…`, `xox[baprs]-…`), JWTs (`eyJ…`), `Bearer <token>`,
   `key|token|secret|password|sig=` URL parameters, and e-mail addresses → `[redacted]`. The house style of
   the repo (`sanitize`) is replaced, never removed: the redaction runs on the way **in**, so the state and
   the HTML can only ever see the redacted string.
3. **Static server**: only `office/public/**`, path normalised and prefix-checked after `realpath`; `.env`,
   `.git`, dotfiles and symlinks out of the root are refused with 404 (not 403 — a 403 confirms a file).
4. **Local only**: bind `127.0.0.1` (`--host` refuses anything else unless `--i-know-what-i-am-doing`), no
   `Access-Control-Allow-Origin` header at all, `Content-Security-Policy: default-src 'self'; img-src 'self'
   data:; connect-src 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
   no-referrer`. The SSE endpoint answers only `text/event-stream` and checks `Origin` when present.
5. **No secrets in the repo**: no credentials, no e-mail addresses, no keys in demo data, tests, README or
   screenshots.
6. **Subprocess hygiene**: every source command is `execFile` (never a shell), with a fixed argv, a 10 s
   timeout, `maxBuffer` 8 MB, and `stdio: ['ignore','pipe','pipe']`; stderr is kept for the banner, truncated
   to 200 chars, and redacted before it is shown.

---

## 6. Failure states

| Situation | The office does |
|---|---|
| `orca` not installed | `sources.orca.ok=false`, banner "Orca is not available — showing git only", people from worktrees stay, no crash |
| Orca present, no Run selected | `sources.tasks.ok=false, error:"no orchestration run selected"`, the board of issues/PRs still draws |
| `gh` absent / unauthenticated | board hidden, banner names the reason; issues and PRs are `[]`, never invented |
| Empty board (real empty answer) | board draws its lanes with a "no issues yet" line; not an error |
| Source returned stale data | `lastOkAt` shown; a source that has not answered for 60 s is drawn as `stale` |
| Poll throws for one source | that source only degrades; the other people stay; one `source` patch is emitted |
| SSE client disconnects | server drops the client, keeps one timer; client reconnects and re-reads `/api/state` |
| Nothing at all resolves | an empty-but-valid office with every banner, and `/api/health` naming each reason |

---

## 7. Tests (`node --test office/test`, no dependency)

| File | What it fails on |
|---|---|
| `mapper.test.mjs` | Orca JSON with `preview` containing `ghp_…` and an e-mail → the serialised state contains neither; a missing field → `null`, not a guess; a terminal title prefix → provider |
| `redact.test.mjs` | each token class (key, JWT, bearer, URL param, e-mail) is redacted; a plain title is untouched |
| `git-source.test.mjs` | porcelain parsing: worktrees, detached HEAD, dirty counts; a git that exits 128 → `ok:false`, no throw |
| `github-source.test.mjs` | `[]` is a real answer; `blocked`/`lane:*`/`P*` labels map; an unknown label becomes `unknown` |
| `sse.test.mjs` | state-then-patch framing; a change emits one patch; no change emits none; a heartbeat is `: ping`; a client that closes unsubscribes |
| `demo.test.mjs` | two fresh demo states at the same tick are byte-identical; the cast is stable; a demo never claims a live source |
| `static.test.mjs` | `../.env`, `%2e%2e/`, an absolute path and a symlink to outside all 404; the CSP header is present |
| `state.test.mjs` | every person's `state` is one of the five; every field of the public shape is present (no `undefined` leaking as a key) |

A test that cannot fail is not written: each case above is red if its mapper rule is removed.

---

## 8. Open questions for the owner / lead

1. **Fonts.** The mockups use *Be Vietnam Pro* + *JetBrains Mono*. No external assets/CDN are allowed, so the
   office will fall back through the local stack. May I commit two `.woff2` files (~60–120 KB) into
   `office/public/fonts/` for fidelity, or keep the system stack? *(Default in this plan: system stack.)*
2. **Orca tasks.** `orchestration run-list` is unavailable on Orca 1.4.198, and `task-list` needs a bound Run.
   Do you want `npm run office -- --run <id>` (read-only, no binding), or should the office never read Orca
   tasks and derive everything from terminals + git + gh? *(Default: the optional flag, off by default.)*
3. **Board repository.** This repo's `gh issue list` is empty while the mirror has the team's issues. Which
   repo is the board? *(Default: the current repo's remote; `--repo <owner/name>` available.)*
4. **Departments.** The brief names lead, QA, SA-Systems, SA-Code, dev lanes, release. The mockups show rooms
   the brief does not name (a lounge?). Should the office have exactly the six, or add a shared room for idle
   terminals? *(Default: exactly the six.)*
5. **Activity wording.** The curated line is derived from an issue/task title. If no title exists, is `—`
   acceptable, or do you want a generic "In a session" label? *(Default: `—`, because the brief forbids
   guessing.)*
6. **Auto-open.** `npm run office` opens nothing (contract). Is a `--open` convenience flag wanted later?

---

## 9. Deliverables and the exact commands

```
office/
  server.mjs            static + /api + SSE, 127.0.0.1:4317
  lib/state.mjs         poll → whitelist map → OfficeState (pure)
  lib/redact.mjs        the redaction rules (pure)
  lib/sources/{orca,git,github}.mjs
  lib/demo.mjs          seeded cast + virtual clock
  public/{index.html,app.js,style.css,favicon.svg}
  test/*.test.mjs
  README.md
```

Root `package.json` gains exactly two scripts: `office` and `office:test`. `dev-team-sync.json` gains `office`.
Nothing outside `office/`, those two files and the sync list is touched.

```
npm run office            # live on http://127.0.0.1:4317
npm run office -- --demo  # deterministic simulated office
npm run office:test       # node --test office/test
```

Node 18-compatible syntax (`node:` built-ins, `execFile`, `node:test`); this repo's own engine floor is 20.11,
so 18 is a target for the mirror, not a claim about the engine here.

---

## Where this work stopped (2026-11-17, memory hold)

The plan, the server, the source adapters, the demo, the UI, the tests (43 green) and the README are committed on
`feat/office-ui`; **nothing was run in a browser and no live-source smoke was taken** (no `--once`, no screenshot) —
the machine was out of memory. Not pushed, not merged. Next: a live `npm run office -- --once`, one demo and one
live screenshot against the two mockups, then the open questions in §8.
