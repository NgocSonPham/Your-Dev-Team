# Your Dev Team

A repo-native operating system for AI dev teams: seats with written authority, skills an agent can load,
project knowledge that is checked at merge time, an issue lifecycle with real gates, and a local office you
can watch.

It is not a framework and it is not a service. It is a set of plain files — markdown, two Node scripts, and a
static UI — that you copy into a repository and adapt.

## What is in here

| Path | What it is | Start with |
|---|---|---|
| `.claude/skills/` | the six seat skills: `xqa-lead`, `xqa-qa`, `xqa-sa-systems`, `xqa-sa-code`, `xqa-dev-lane`, `xqa-release` | the seat's `SKILL.md` |
| `docs/process/` | the team model (`team.md`), the knowledge design (`knowledge.md`) and the review/PR/issue templates | `team.md` |
| `ISSUE-FLOW.md` | how an issue enters, is designed, built, reviewed, merged and released | §3 |
| `knowledge-kit/` | the portable knowledge model: rules, templates, two skills, and the merge gate | `knowledge-kit/README.md` |
| `scripts/issue-flow.mjs` | the gate and issue automation (needs `gh`) | `node scripts/issue-flow.mjs` |
| `scripts/team-up.mjs` | one cold-start command that opens the lead with the board in hand (needs Orca) | `node scripts/team-up.mjs --dry-run` |
| `office/` | a local, realtime virtual office for the team (Node only, no dependencies) | `office/README.md` |

Everything is plain text. Nothing here needs a build step, a database, or a hosted service.

## The shape

Four standing seats and a pool of dev lanes:

| Seat | Owns | Never |
|---|---|---|
| **Lead / Integrator** | triage, assignment, SA engagement, WIP, merge, close, release, owner interface | implement code in an issue it will merge; set the QA gate |
| **QA** | reproduction, acceptance criteria, the developer checklist, independent verification | write product code; widen scope silently |
| **SA-Systems** | contracts, data model, migrations, infra, security, failure semantics | implement; approve a head it did not read |
| **SA-Code** | module shape, reuse, callers, tests that can fail, diff size | product semantics; style nits as blockers |
| **Dev lane** (pool) | one issue: smallest change, red-first tests, evidence, PR | push `main`; merge; close; touch another lane's files |

Two rules make the shape real rather than decorative: **nobody certifies their own work**, and **a verdict
pins a head** — if the branch moves, the approval does not carry over.

Gate labels (`gate:sa-systems-approved`, `gate:sa-code-approved`, `gate:qa-passed`) each have exactly one
writer. `scripts/issue-flow.mjs close` refuses without them.

## Adopt it in another repository

1. **Skills.** Copy the seat folders you want into the target repository:

   ```bash
   cp -R .claude/skills/xqa-* <target>/.claude/skills/
   ```

   Rename them if you like (`xqa-` is this team's prefix), then edit the paths and commands they name — the
   procedures travel, the project facts do not.

2. **Process.** Copy `docs/process/` and `ISSUE-FLOW.md`. Read `team.md` §2 (seats), §4 (gate authority) and
   §9 (starting a seat) before changing anything; the templates in `docs/process/templates/` are the forms the
   gates expect.

3. **Knowledge gate.** Copy `knowledge-kit/` into the target and initialise it:

   ```bash
   node knowledge-kit/scripts/knowledge.mjs init
   node knowledge-kit/scripts/knowledge.mjs status
   node knowledge-kit/scripts/knowledge.mjs check
   ```

   Then edit `AGENTS.md` (commands, map path, non-negotiables), fill `docs/knowledge/index.md`, add one module
   page from `knowledge-kit/templates/module.md`, and list it in `knowledge.config.json`.
   Copy `knowledge-kit/skills/knowledge-keeper` and `knowledge-reviewer` beside your seat skills.

4. **Automation (optional).** Copy `scripts/issue-flow.mjs`. It needs the `gh` CLI with the `repo` scope:

   ```bash
   node scripts/issue-flow.mjs setup-labels
   node scripts/issue-flow.mjs status
   ```

   `create`, `evidence`, `no-sa`, `gate` and `close` are documented in `ISSUE-FLOW.md` §6. `evidence` scans a
   report for secrets before posting it; `close` is the gate.

5. **Office (optional).** Copy `office/` and run it with Node 18+ — no install, no network:

   ```bash
   node office/server.mjs --demo      # deterministic demo office, no Orca, no gh
   node office/server.mjs             # live: reads this checkout's Orca terminals and git worktrees
   ```

   It binds `127.0.0.1:4317`. `--once` prints the state as JSON and exits; `--port`, `--root`, `--repo`,
   `--run`, `--seed` are in `office/README.md`. It never serves terminal output bodies and never renders
   `.env`, `.git` or anything outside `office/`.

Requirements: Node 18+, `git`, and an agent that can load `SKILL.md` files (Claude Code, or any equivalent).
`gh` and Orca are optional and only the features named above need them.

## Not wired yet

There is **no root `package.json`** in this repository, so the `npm run …` commands you will see quoted in the
source repository do **not** exist here. Nothing is broken; those scripts were never ported. Use the direct
commands instead:

| Quoted elsewhere | Status here | Use this |
|---|---|---|
| `npm run office` | not done | `node office/server.mjs` |
| `npm run office:test` | not done | `node --test office/test/*.test.mjs` |
| `npm run team:up` | not done | `node scripts/team-up.mjs` |
| `npm run sync:dev-team` | not done — the sync script belongs to the source repository and is not published | nothing to run in this clone |

If you want the scripts, add a `package.json` to your own repository and point each name at the same file; the
code does not depend on npm.

Other honest gaps:

- The six seat skills were written for the xQA repository. They reference its `CLAUDE.md`, lanes and commands;
  treat them as a procedure to adapt, not a drop-in.
- `office/` has 43 tests (redaction, SSE framing, static-file rules, demo determinism) but has not been
  smoke-tested live against a real Orca/`gh` install, and the visual fidelity against the owner's mockups is
  unverified.
- `scripts/team-up.mjs` assumes Orca on this machine; it is not portable to another harness as written.

## This repository is generated

This is a **mirror**. The source of truth is the xQA repository; the files here are exported from it by the
`dev-team-sync` script in that repository, together with `SYNC-MANIFEST.json` (source head, sync time, one hash
per file).

Consequences:

- Do not edit files here and expect the change to survive — the next sync overwrites what it manages.
- There is no CI, no release process and no support contract here. Treat it as a snapshot of a working setup.
- If something is wrong, fix it upstream, not in this checkout.

`README.md` (this file) is not part of the generated set.

## License

No license has been chosen yet. Ask before redistributing.
