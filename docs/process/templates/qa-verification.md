# QA verification — post-build (QA writes this; the implementer never does)

**Verdict:** PASS / FAIL
**Build SHA tested:** `<sha>` — read from the deployed/loaded build, not from the PR text.
**Environment:** local stack / Prod · DB `<name>` · ports · accounts by key name only.
**Issue:** #<n>
**Checklist source:** the QA acceptance comment linked on the issue.

## 1. Checklist, item by item

| Acceptance item | Steps I ran | Expected | Actual | Evidence |
|---|---|---|---|---|
| | | | | path |

QA reproduces from the issue and its own checklist, not from the developer's report.

## 2. Full-feature exploration (beyond the checklist)

Walk the feature and the bug path as a user would. Report anything that is not consistent with the rest of the product:

- **UI/UX consistency:** layout, spacing, labels, the same action having a different name or position, empty and error
  states, keyboard/focus, read-only and permission states.
- **Logic drift:** a sibling flow that still behaves the old way, a status or badge that no longer matches, duplicated
  data or a stale value, a toast/message that says something the backend no longer sends.
- **Side effects:** other screens touched by the same data, runs/fixtures left behind, background jobs, the queue.
- **Data safety:** what was created, changed or removed; whether it was restored or left as the issue requires.

Each finding: reproduction steps, evidence path, severity, and whether it blocks this issue or becomes a new one.

## 3. Regressions

| Area the change can reach | Check | Result |
|---|---|---|

## 4. Deviations from the acceptance criteria

Any difference, with severity. An item not exercised is **not verified**, never passed.

## 5. New issues filed

- #<n> — <title> (for each side effect outside this issue's scope)

**Left unverified:** list it.
