# Mirror — Your Dev Team

The source of truth for this kit and the team process is **xQA**. The public repository
[`NgocSonPham/Your-Dev-Team`](https://github.com/NgocSonPham/Your-Dev-Team) is a **generated mirror**:
edit here, sync out. Never edit the mirror by hand — the next sync overwrites it.

## What is shared

| Source path | Why |
|---|---|
| `knowledge-kit/` | the portable knowledge model, rules, templates, skills and gate |
| `docs/process/` | the team model (`team.md`), the knowledge design (`knowledge.md`), the issue templates |
| `ISSUE-FLOW.md` | the issue lifecycle |
| `.claude/skills/` | the six seat skills (lead, QA, both SAs, dev lane, release) |
| `scripts/issue-flow.mjs` | the issue/gate automation |
| `scripts/team-up.mjs` | the Orca cold-start command |

Everything else in xQA — product code, contracts, task records, the xQA README — stays out of the mirror.

## The reminder on this machine

A commit that touches a shared path writes `.git/dev-team-sync-pending.json` (in the git common dir, so
every worktree sees it) and prints:

```
Your Dev Team: this commit touched the shared kit (N files).
Sync before you forget:  npm run sync:dev-team
```

On macOS it also fires a notification. The marker stays until a sync succeeds. It is a **post-commit**
hook on purpose: the owner's rule is "push 0s", so nothing runs during a push and no commit is blocked.

**Worktrees.** The hook is `.husky/post-commit` and needs Husky's generated `.husky/_` in that checkout.
A fresh lane worktree has neither until `npm install` runs there once; the marker is shared, but the
reminder is not. When in doubt, the authoritative check is `npm run sync:dev-team -- --check`, which runs
from any worktree and resolves the mirror beside the main checkout.

## Commands

```bash
npm run sync:dev-team            # export to ../Your-Dev-Team, commit there (no push)
npm run sync:dev-team -- --push  # export, commit, push
npm run sync:dev-team -- --check # exit 1 if the mirror differs from this tree
npm run sync:dev-team -- --dry-run
node scripts/dev-team-sync.mjs status
```

The mirror carries `SYNC-MANIFEST.json`: the source head, the sync time, and a hash per file. That is how
`--check` notices a file changed here, a file deleted here, or a file edited directly in the mirror.

## Setup on a new machine

```bash
git clone git@github.com:NgocSonPham/Your-Dev-Team.git ../Your-Dev-Team
npm run sync:dev-team -- --check
```

Set `YOUR_DEV_TEAM_DIR` if the clone lives somewhere else; `--to <dir>` overrides both for one run.

## When to sync

- **Before closing an issue** that changed a shared path. The lead's merge checklist calls `--check`.
- **Before a release**, so the public copy matches what shipped.
- **After a process change** — `team.md`, `ISSUE-FLOW.md`, a seat skill, the knowledge kit.

A shared kit change is not done while the mirror is stale; the marker is the local reminder, the merge
checklist is the gate.
