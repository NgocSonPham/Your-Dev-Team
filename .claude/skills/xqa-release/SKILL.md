---
name: xqa-release
description: >-
  Run the xQA release train: freeze the tree, confirm every gate on the exact commit, merge in the recorded
  order, deploy to Prod, run the smoke checks, run the from-empty rehearsal once, and keep a rollback path.
  Use this whenever a release issue or milestone is ready, when the owner gives a Prod window, or when a
  deploy or rehearsal is about to run — even if the request is only "ship it".
---

# The release seat

This is a hat the lead wears, not a separate opinion. A release is a **checked procedure**, not a merge
followed by hope. The runbook for the current release is the source of truth for the merge order and the
smoke list; this skill is the discipline around it.

Preconditions, all of them, before anything is merged or deployed:

- The **owner has given the Prod window**. No window, no deploy.
- Every included issue has its SA and QA gate on the **head that will ship**, or a recorded owner override.
- The tree is the tree that was tested: record the exact SHA and say which issues it contains.
- A rollback path exists: the previous release SHA, and the command (`infra/vps/deploy.sh rollback` or a
  revert) that gets back to it.

## 1. Freeze

Stop new merges into the integration branch for the window. Any lane that lands after the freeze is in the
**next** release and says so on its issue. A moving tree invalidates the gates you just checked.

## 2. Check the exact tree

Run the gates on the frozen SHA, not on a branch name:

```bash
git rev-parse HEAD
npm run typecheck
npm run build
# the targeted suites the release touches, with counts
```

Record the SHA, the counts and the artifact paths on the release issue. If the SHA moves, go back to §1.

## 3. Merge in the recorded order

Follow the runbook's order — it exists because the lanes were built and reviewed against each other in that
order. A merge conflict is a signal that the order or the base changed: stop, resolve with the lane owner,
and re-run the gate for the changed part. Do not resolve a semantic conflict in the merge commit without a
review of the result.

`main` is promoted by this seat only. Feature lanes never push it.

## 4. Deploy and smoke

Deploy with the project's deploy path (`infra/vps/deploy.sh`), then smoke the deployed build:

- the app returns 200 and the loaded build SHA is the one you shipped;
- the module the release touched works on a real account (by key name only);
- the worker and queue are alive, and no process is running a stale `dist`;
- the health/admin endpoint agrees across processes.

If SSH or a dependency is down, the release **stops** and the owner hears it with the exact error. A release
that cannot be verified is not a release.

## 5. Rehearsal

The from-empty rehearsal runs **once**, on the named box (currently VCodeX), from an empty project, with the
real transport. It is the only measurement of the risks unit tests cannot see — setup contention, worker CPU,
browser pressure, first-run ordering. Do not re-run it to get a nicer number; record the number you got and
what it means.

Do not keep a worker warm "just in case" — that was considered and rejected. Start it for the rehearsal,
measure, stop it.

## 6. Report

On the release issue, in numbers:

- shipped SHA, deployed SHA, smoke results per item;
- rehearsal: duration, cases, passes/fails, peak memory/CPU, and the two unmeasured risks now measured;
- what was **not** verified and why;
- rollback: the exact previous SHA and the command.

Then close the issue with the merge/deploy SHAs. Issues that merged but did not ship stay `status:merged`,
never "done".

## Red lines

- Do not deploy without the owner's window, or with a red gate.
- Do not re-run the rehearsal for a better result, or keep a worker warm after it.
- Do not print a secret, key, token or raw environment in the release report.
- Do not call a release done from a merge; only a verified deploy and smoke is done.
