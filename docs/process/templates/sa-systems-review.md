# SA-Systems review — system architecture, contracts, data, infrastructure

**Verdict:** APPROVE / CHANGES
**Exact head reviewed:** `<sha>` (a new head needs a review of the changed part)
**Issue:** #<n>

## What I checked (system criteria)

- Data model and contracts: does the change fit the canonical contracts, or does it add a rule that contradicts one?
- Boundaries: any layer crossed, any module reached into another's data, any duplicated source of truth?
- Migration: expand-then-contract, backward compatible for rollback, dry-run/report where data is touched.
- Failure semantics: refusal codes, retries, unknown vs false, tenant/org isolation, partial writes, rollback.
- Infrastructure and providers: worker slots, queues, leases, provider transport, keys and secrets, quotas and credits.
- System performance: queries per operation, passes, reads, model calls, memory, cost per run.
- Security: secret storage and lifecycle, authz, audit, no plaintext to browser/log/error.

## Findings

| # | Severity | Claim | Evidence (file:line / probe) | User/ops effect | Correction |
|---|---|---|---|---|---|
| S1 | | | | | |

## Joint plan input (with SA-Code)

- Options considered:
- Chosen option and why:
- Rejected options and why:
- Anti-over-engineering answers (five questions in `ISSUE-FLOW.md` §2):
- What this plan does NOT build:
- Decision that must go to the lead/owner (behaviour, data, money, release):

## Performance section (mandatory)

Measured numbers, or an explicit no-claim. Name the hotspots and whether the change adds passes/reads/latency.

## Not verified

Every live/DB/Prod/browser check not performed. Never imply green.
