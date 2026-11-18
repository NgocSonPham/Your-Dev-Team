# SA-Code review — code structure, modules, tests, consistency

**Verdict:** APPROVE / CHANGES
**Exact head reviewed:** `<sha>` (a new head needs a review of the changed part)
**Issue:** #<n>

## What I checked (code criteria)

- One behaviour, one small module; no god file grew; no layer inside a layer; no forwarding-only wrapper.
- Reuse before write: an existing module/contract that already does this, extended rather than duplicated.
- Every caller and consumer updated consistently — no partial update, no second copy of the same predicate.
- Tests: red on the old code first, green after; the test can fail; counts recorded; no test that compares a value to
  itself.
- Diff size and readability: the smallest diff that satisfies the acceptance criteria; no reformatting of shared files.
- Naming, comments, contracts: English in code; comments explain why, with file:line for the defect.
- Code-level performance: per-item reads inside loops, repeated scans, O(n²) over the item set, allocations on a hot path.

## Findings

| # | Severity | Claim | Evidence (file:line / probe) | User effect | Correction |
|---|---|---|---|---|---|
| C1 | | | | | |

## Joint plan input (with SA-Systems)

- Module boundaries and files to add/grow (with the reason no existing module fit):
- Callers to update (grep evidence):
- Tests to add (names and the red-first proof):
- Anti-over-engineering answers (five questions in `ISSUE-FLOW.md` §2):
- Decision that must go to the lead/owner:

## Performance section (mandatory)

Measured numbers, or an explicit no-claim: complexity changes, extra passes/reads, regressions versus the named base.

## Not verified

Every check not performed.
