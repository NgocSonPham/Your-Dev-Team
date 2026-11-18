# Pull request (lead opens, or the lane with lead approval)

Closes #<issue>

## Head

- Branch:
- Head SHA (pinned):
- Merge target: the integration branch (never `main` from a lane)

## What changed

- One paragraph, then the modules added/grown (file + line count).

## Why

- The defect/finding, with the evidence that proves it (file:line, counts).

## Verification (implementer)

| Check | Command | Result |
|---|---|---|
| QA checklist, item by item | | pass / not verified |
| Targeted specs | | counts |
| Worker/app/schemas suites | | counts |
| Typecheck | | 0 outside baseline |
| Build | | pass/fail |
| Performance | | numbers or no-claim |

## Evidence

- Report: `.scratch/<lane>-report.md`
- Probes/artifacts: paths only, never secrets.
- Screenshots (UI): paths.

## Review

- SA-Systems verdict: link (or `sa-not-required` by the lead)
- SA-Code verdict: link (or `sa-not-required` by the lead)
- QA verdict: link (PASS / FAIL, independent reproduction)
- Owner override (only if used): link + reason

## Rollout and rollback

- Deploy impact:
- Rollback: `infra/vps/deploy.sh rollback` / revert commit
- DB impact: none / expand-contract explained

## Not verified

- Exactly what was not run (live run, browser, Prod, DB) — never implied green.
