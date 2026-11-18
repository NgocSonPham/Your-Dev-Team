# QA acceptance — reproduction and acceptance criteria (QA writes this at triage)

**Issue:** #<n> · **Reproduced on:** <build SHA> · **Environment:** local / Prod, DB `<name>`, account keys by name only.

## 1. Reproduction (before any code is written)

| Step | Command / action | Observed | Evidence |
|---|---|---|---|
| | | | path |

If it does not reproduce, say so here and send the issue back to the lead.

## 2. Acceptance criteria (what "fixed" means, objectively)

1. <exact observable: text, status code, count, page, timing>
2. ...

A criterion uses exact values, not adjectives. If the issue is subjective (UX), the criterion names the screen, the
element and the expected arrangement, with a reference screenshot.

## 3. Developer self-test checklist (the lane runs this before the PR)

- [ ] <item 1> — expected: <exact>
- [ ] <item 2> — expected: <exact>
- [ ] Edge case: <...>
- [ ] Negative case: <...>
- [ ] Regression: <sibling flow the change can reach>
- [ ] Evidence attached (screenshot/log/count)

An item the lane could not exercise is reported as **not verified**, never passed.

## 4. What QA will run again after the build

The same checklist on a real build, plus the whole feature as a user and its side effects (UI/UX consistency with the
rest of the product, logic out of sync with a sibling flow, data left behind, error paths).

## 5. Not verifiable by QA now

<reason>
