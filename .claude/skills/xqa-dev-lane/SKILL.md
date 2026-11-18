---
name: xqa-dev-lane
description: >-
  Act as an xQA development lane: implement exactly one assigned issue in its own worktree — smallest diff,
  a test that is red on the old code first, every caller updated, self-test on QA's checklist, evidence
  comments, then a PR. Use this whenever a session is about to change product code for an xQA issue, even if
  the request is only "fix this bug" or "implement this ticket".
---

# The dev lane seat

You own **one issue**. Your branch, your worktree, your evidence. You do not merge, you do not close, and you
do not decide that the issue is bigger than it is.

Read `CLAUDE.md` §1 first — the cold-start read order. Then the issue, QA's acceptance comment, and
`docs/process/team.md` §5 and §8.

## 1. Start clean

- Work in your own worktree, branched from the **integration branch** named on the issue (never `main`).
- Confirm the issue has QA's acceptance criteria and the lead's lane assignment. If either is missing, stop
  and ask the lead; do not invent scope from a title.
- This repository runs its lanes on **Claude**. Do not start an OpenCode lane for assigned work.

Read only what the issue needs: the module's contract (`app/document/_api/<module>/`), the plan step, the
symbols you will touch. Large documents here are grepped, not loaded.

## 2. Build the smallest correct change

- **Red first.** For each behaviour in the acceptance criteria, write a spec that fails on the old code for
  the reason the issue describes. Run it, keep the failure output. A test that passes before your change
  proves nothing.
- **One behaviour, one place.** Extend the module that already does this; do not add a layer for one caller.
- **Update every caller.** Grep the predicate/field/function you change; a partial update is the defect this
  repository keeps paying for. Put the grep in the PR.
- **No drive-by.** No reformatting shared files, no rename nobody asked for, no unrelated dependency.
- **Unknown stays unknown.** Where a fact can be unproven, do not silently turn it into the convenient
  boolean; follow the issue's rule for the draft/hold path.

## 3. Self-test on QA's checklist

Run the checklist item by item, on your build, and record the actual result. An item you could not exercise
is **not verified**, never passed. Then run the suites the change can reach and record the counts:

```bash
npm run typecheck
npm test --workspace @platform/server   # or the narrower package + spec
```

## 4. Evidence, then the PR

Post append-only comments as you go — head SHA, what ran, counts, artifact path. Never paste a secret, token,
key or raw environment:

```bash
node scripts/issue-flow.mjs evidence --issue N --file .scratch/<lane>-report.md --head <sha> --note "targeted specs"
```

Open the PR with `docs/process/templates/pr.md`: pinned head, what/why, the verification table, the evidence
paths, the SA/QA links, rollout and rollback, and the explicit not-verified list. The lead pushes the branch
if you cannot.

If you were started as a supervised Orca worker, finish with `worker_done` using the IDs Orca injected into
your task:

```bash
orca orchestration send --type worker_done --subject "<status>" --body "<what changed, counts, what remains>" \
  --task-id <task_id> --dispatch-id <dispatch_id> --outcome succeeded --files-modified "path/a,path/b" --json
```

On failure use `--outcome failed`; never encode a failure only in prose.

## Red lines

- Do not push `main`, merge, or close the issue.
- Do not set any gate label — not QA's, not SA's.
- Do not touch another lane's issue or files, and do not start "while I'm here" work.
- Do not change the acceptance criteria to match what you built; report the deviation instead.
- Do not claim green without the command, the count and the artifact.
