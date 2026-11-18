# Issue — lane task (filled by the lead or the owner)

> Every section is required. An issue without §3 acceptance placeholders and §4 audit placeholders is not ready for triage.
> Never paste a secret, key, token, password, seed or raw environment dump. Link the artifact path instead.

## 1. Identity

| Field | Value |
|---|---|
| Issue | #<n> (assigned after opening) |
| Lane | `<name>` (lead assigns at triage; `lane:tbd` until then) |
| Accountable human | lead / owner |
| Branch | `fix/mf-...` |
| Worktree | `.scratch/wt-...` |
| Area | fixtures / generation / test-runs / worker / ai / ui |
| Priority / severity | P0–P3 |
| Milestone / release | |
| Depends on / blocked by | issue numbers |

## 2. Problem and intent

- **Goal (one sentence):**
- **Why now:** the owner's words or the measured evidence.
- **Current behaviour:** `file:line`, the exact observed output.
- **Expected behaviour:** observable, testable, exact strings/statuses where they matter.
- **Non-goals / out of scope:**

## 3. Scope

- **Files / modules expected to change:**
- **Contracts affected:** fixtures / data-set / testcases / test-runs / other.
- **Data or DB:** migration? expand-then-contract? none?
- **UI surfaces:**
- **Explicitly not changed:**

## 4. Evidence before the work

- **Reproduction:** exact commands/steps.
- **Observed output:** logs/traces/screenshots — paths only.
- **Measurements:** numbers (counts, timings, tokens), not adjectives.
- **Related commits/issues:**

## 5. For QA — reproduction and acceptance (QA fills this after triage)

QA posts `docs/process/templates/qa-acceptance.md` as a comment and links it here.

- Acceptance criteria (testable statements):
- Developer self-test checklist:
- Edge and negative cases:
- What QA cannot verify:

## 6. For SA — engagement and audit (lead decides; SA fills the plan)

- **SA engaged:** yes / no (lead's decision and reason)
- Contract sections to check:
- Code paths and consumers to inspect:
- Performance requirement (numbers or explicit no-claim):
- Security requirement:
- Required probes/tests:

## 7. Gates — every required one before close

- [ ] Code complete; branch pushed; worktree clean; head SHA pinned.
- [ ] Targeted/unit tests green — counts recorded.
- [ ] Typecheck/build: 0 outside the named baseline.
- [ ] SA-Systems APPROVE (or `sa-not-required` recorded by the lead)
- [ ] SA-Code APPROVE (or `sa-not-required` recorded by the lead)
- [ ] QA PASS — independent reproduction, evidence attached.
- [ ] Performance evidence — numbers or explicit no-claim.
- [ ] Security evidence — no secret, key handling, scopes.
- [ ] Contract/docs updated if behaviour changed.
- [ ] Rehearsal or Prod check if user-visible.
- [ ] Rollback plan stated.

## 8. Evidence log (append-only comments)

Every entry: `date/time · actor · head SHA · what was run · result · artifact path`.
