# Office — a local, realtime virtual office for Your Dev Team

One command opens a small UI that shows the team as an office: departments, desks, people, what each person is
doing, and the work board — updating live. It exists so that watching terminals is pleasant and legible.

**It is a view, never a source of truth.** It reads; it never writes to Orca, git or GitHub, and it never
proxies terminal output.

```
npm run office            # http://127.0.0.1:4317 — your team, live
npm run office -- --demo  # a deterministic simulated office, no Orca, no gh, no network
npm run office:test       # node --test office/  (no dependencies)
```

Node 18+. **No dependencies, no build step, no external fonts or CDNs.** Localhost only.

---

## What it shows

Two views, one state:

- **Office** — rooms for Team Lead, QA, SA · Systems & Code, Dev lanes and Release; one desk per Orca terminal
  (or per worktree when Orca is unavailable); a status ring per person and one line of activity.
  Working desks type, reviewing desks hold a document, idle people breathe, a blocked person has a red lamp.
- **Wall board** — issues and pull requests in columns (triage → spec → build → verify → review → merge),
  each card showing its owner lane, priority and state. The board overlays the office; `Esc` or **Close**
  returns. Press `b` to toggle.

A banner names every source that is unavailable and why. A `demo` chip marks the simulated office. A footer
ticker shows the last event and the people counts.

## Where the data comes from

| Source | Command | What is read |
|---|---|---|
| Orca terminals | `orca --json terminal list --limit 200` | handle, title, branch, worktree, connected, `lastOutputAt` |
| Orca tasks (optional) | `orca --json orchestration task-list --run <id>` | task id, title, status, assignee |
| Git | `git worktree list --porcelain`, `git -C <wt> status --porcelain` | worktree, branch, whether the tree is dirty (file count only) |
| GitHub (optional) | `gh issue list`, `gh pr list` | number, title, state, labels, url, updatedAt |

Facts measured on Orca **1.4.198** (2026-11-17), which shaped this design:

- `--json` must come **before** the subcommand: `orca --json terminal list`, not `orca terminal list --json`.
- `terminal list` rows include a `preview` field with **raw terminal output**. The office reads none of it.
- `orchestration task-list` needs a **bound Run**. The office never binds one — pass `--run <id>` to read a
  Run that is already bound (read-only); without it, Orca tasks are simply unavailable and the banner says so.
- `orchestration run-list`, `worker-list` and `worktree list|ps` appear in `orca --help` on that build but
  answer `invalid_argument`. They are not used.

When Orca is unavailable, people are derived from git worktrees (one row per branch, `provider: null`); when
`gh` is unavailable — or answers an empty list — the board is hidden or empty, never invented.

## Privacy and safety

- **No terminal output, ever.** The Orca mapper names the fields it keeps and drops `preview`, `ptyId`,
  `incarnationId` and the tab/leaf ids; the serialised state is tested not to contain a token planted in a
  fake preview.
- **Redaction runs on the way in** (`office/lib/redact.mjs`): API keys, GitHub tokens, JWTs, bearer headers,
  `token|key|secret|password|sig=` URL parameters, `KEY=value` secret pairs and e-mail addresses become
  `[redacted]` before they reach the state or the page.
- **Only `office/public/**` is served.** Paths are normalised and `realpath`-checked; `.env`, `.git`,
  dotfiles, server sources and anything outside the folder answer **404** (never 403 — a 403 confirms a file).
- **Local only.** Binds `127.0.0.1` (any other host is refused), no CORS header at all, a strict
  `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a Host
  check that refuses a foreign `Host:` header (DNS rebinding).
- No telemetry, no external request, no auth (it is a local view), no secret written to the repo or logs.

## Options

```
--demo             deterministic simulated office (no Orca, no git, no gh)
--seed <n>         demo seed (default 933934 — same seed, same office)
--once             print /api/state as JSON and exit
--port <n>         port (default 4317)
--host <addr>      bind address (default 127.0.0.1; anything else is refused)
--interval <ms>    poll interval, min 500 (default 1500)
--run <id>         read Orca orchestration tasks for this Run (read-only)
--repo <o/name>    board repository for gh (default: the checkout's own remote)
--root <path>      the repository to watch (default: this checkout)
```

## API

| Route | Answer |
|---|---|
| `GET /api/state` | the full state (JSON, `no-store`) |
| `GET /api/events` | SSE: one `state` event, then `patch` deltas, `: ping` every 15 s |
| `GET /api/health` | `{ ok, mode, uptimeMs, clients, sources }` |

Patch types: `tick`, `source`, `person` (`added` / `changed` / `removed`), `board` (`added` / `changed` /
`removed`). The page re-reads `/api/state` when the stream reconnects, so a missed patch cannot leave a stale
office.

## Demo mode

Deterministic by construction: a seeded PRNG (`mulberry32`) and a **virtual clock** (`DEMO_EPOCH + tick ×
interval`) — nothing reads `Date.now()` or `Math.random()`. The same tick is byte-identical across processes
(tested). The cast, rooms and board are literal data marked `demo` in the state, the banner and `/api/health`.
Demo and live are mutually exclusive.

## Tests

```
npm run office:test
```

43 tests, no dependency: redaction classes; the Orca mapper dropping `preview` (a fake token in a fake preview
never reaches the state); git porcelain parsing; GitHub label mapping (owner lane vs column); SSE framing and
the static-file rules (traversal, 404, CSP, foreign Host); demo determinism; the state diff.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "cannot reach the office API" | the server exited — check the terminal it was started in |
| "Orca is not available" | `orca` is not on `PATH`; people come from git worktrees |
| "no orchestration run selected" | pass `--run <id>`; the office never binds a Run itself |
| board empty but no banner | `gh` answered an empty list — that is a real answer |
| port already in use | `--port <n>` |

## What this is not

Not a dashboard with history, metrics or trends; not a log viewer; not a control surface (nothing here starts,
stops or merges anything); not a second source of truth. People shown are **terminals and workers**, not humans.