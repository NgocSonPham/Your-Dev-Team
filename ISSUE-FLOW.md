# Issue lifecycle — how work enters, is designed, is built, and is closed

This is the operating process for every issue in this repository. It is written for the people and the agents who do the
work: the owner, the lead, QA, the two SA reviewers, and the development lanes. It exists so that the owner can follow a
single board, QA can verify objectively, SA can audit fully, and nothing closes on a claim without evidence.

## 1. Principles

1. **One issue, one accountable lane, one PR.** No issue without acceptance criteria (QA) and an audit plan (SA).
2. **Evidence over claims.** Every step leaves a comment: head SHA, what ran, the result, the artifact path. A verdict
   pins a head; a new head needs a new verdict for the changed part.
3. **Independent verification.** QA reproduces from the issue, not from the developer's report. SA reviews from the
   contract and the code, not from the summary.
4. **Two SA roles, one plan.** SA-Systems and SA-Code review together, argue, and deliver one plan that fits this
   project. Hard decisions go to the lead, who confirms with the owner.
5. **No over-engineering.** A change must be the smallest thing that satisfies the acceptance criteria and the existing
   contracts. New layers, abstractions or infrastructure need an explicit reason in the plan.
6. **Close only through the gates.** The close command refuses unless both SA and QA verdicts exist.

## 2. Roles

| Role | Owns | Does not |
|---|---|---|
| **Owner** | Product decisions, plan/billing, Prod windows, final confirmation on hard calls | Day-to-day triage, code review |
| **Lead** | Triage, lane assignment, SA engagement decision, merge, close, escalation to owner | Implement code in an issue it will merge; set the QA gate |
| **QA** | Reproducing the issue before work, writing the acceptance criteria/checklist, verifying the PR against it, exploring the whole feature and its side effects (UI/UX consistency, logic drift) | Design architecture, change product scope |
| **SA-Systems** | System-level review: data model, contracts, boundaries, migrations, infra, providers, security, quotas, failure semantics, system performance | Code style, module shape |
| **SA-Code** | Code-structure review: thin code, one behaviour per module, reuse, consistency across callers, tests, maintainability, code-level performance | Product semantics, system architecture |
| **Dev lane** | Implementation on its own branch/worktree, self-test against QA's checklist, evidence comments | Push to `main`, close issues, approve its own work |

### Two SA roles — how they work

Both SAs read the issue and the code, then **research and debate** before the lane starts:

- **SA-Systems** asks: does this fit the data model and contracts? Does it cross a boundary it should not? What happens
  on failure, retry, migration, rollback, tenant isolation, cost and quota? Is a migration expand-then-contract? Is the
  performance at system level acceptable (queries, passes, model calls)?
- **SA-Code** asks: is each behaviour its own small module? Is anything duplicated that should be reused? Does every
  caller change consistently? Is the test set honest (red before the fix)? Does the diff stay small and readable? Is there
  an over-engineered layer that the project does not need?

They exchange findings on the issue (one comment each) and produce **one joint plan**: options considered, the chosen
option, trade-offs, the rejected ones with the reason, the acceptance and the audit checklist. When they disagree, the
lead decides; when the decision changes product behaviour, money, data safety or the release plan, the lead asks the
owner before the lane starts.

**Anti-over-engineering test** (both SAs must answer before the plan is accepted):
1. Does an existing module/contract already do this? If yes, extend it, do not add a layer.
2. Is the new abstraction used by more than one caller today? If not, inline it.
3. Does the change require a new table, service or queue? If yes, say why the existing one cannot carry it.
4. What is the smallest diff that passes the acceptance criteria?
5. What does the project lose if this is not built now?

## 3. The flow

### Step 0 — An issue is opened

The **owner or lead** opens it with `docs/process/templates/issue.md` filled: identity, problem, expected behaviour,
scope, evidence, and the placeholders for QA's acceptance criteria and SA's audit plan. The issue is labelled
`lane:tbd`, `area:<...>`, `P0–P3`, milestone `<release>`.

**Who looks at it: the lead and QA, immediately.** Nobody else starts work from an issue that the lead has not triaged.

### Step 1 — Triage (lead)

The lead reads it, confirms the problem is real and in scope, and records:

- **Assignment:** which lane gets it, from the pool of free lanes. A lane is "free" when its current issue is merged or
  waiting only on review; the lead records the choice and the reason (skill fit, context already loaded, memory pressure).
- **SA engagement:** does this need SA before implementation? **Yes** when it touches a contract, a data model, a
  migration, a provider/infra boundary, security, performance significantly, or when the design is not obvious.
  **No** for a mechanical fix whose shape the issue already pins. The decision is written on the issue.
- **Severity and deadline:** P0/P1 may jump the queue; the lead says what it displaces.

Capacity is part of triage: at most **two dev lanes building** and **one heavy job** (a full run, a build, a
browser grid, the rehearsal) at a time. A lane with nothing runnable stays idle. The lead owns the queue and
records what it displaces; adding a Claude lane needs the owner's approval. The full capacity and escalation
model is in `docs/process/team.md` §5–§7.

### Step 2 — QA reproduces and writes the acceptance criteria

QA reproduces the issue **before** any code is written and posts a comment
(`docs/process/templates/qa-acceptance.md`) with:

- the reproduction (environment, steps, observed output, evidence paths);
- the **acceptance criteria** as testable statements (exact text/status/count, not adjectives);
- the **checklist** the developer must pass before opening the PR, and QA will run again after it — including edge and
  negative cases and the regression checks the change can reach;
- what QA will not be able to verify (and why).

If QA cannot reproduce, the issue goes back to the lead: it is closed as not-a-defect, or re-scoped.

### Step 3 — SA design (only when the lead said yes)

SA-Systems and SA-Code review as in §2, each posting their criteria-based findings, then **one joint plan** on the
issue, with the anti-over-engineering answers. If the plan changes behaviour, data, cost or the release, the lead takes
it to the owner for confirmation before the lane starts.

If the lead said no SA, the lane works from the issue and QA's checklist; it may still ask SA a single question later.

### Step 4 — Build (dev lane)

The lane branches from the current integration branch, implements the smallest change, and writes a spec that is **red
on the old code first** for each behaviour. It posts **evidence comments** as it goes: head SHA, what ran, counts,
artifacts. No secret, key, token or raw environment in any comment; link the artifact path.

### Step 5 — Self-test (dev lane)

Before the PR, the lane runs QA's checklist itself and posts the results against each item. It states what it could not
verify. A checklist item that was not exercised is "not verified", never "passed".

### Step 6 — PR (lead opens, or the lane with lead approval)

The PR targets the integration branch (never `main` from a lane), links the issue (`Closes #N`), and fills
`docs/process/templates/pr.md`: pinned head, what/why, verification table, evidence, SA/QA links, rollout/rollback, and
the explicit not-verified list. The lead pushes the lane branch when the lane cannot.

### Step 7 — SA review (when SA is engaged, or when the change is architectural)

SA-Systems and SA-Code each review the **pinned head** and post a verdict (`docs/process/templates/sa-systems-review.md`,
`docs/process/templates/sa-code-review.md`): APPROVE or CHANGES, what they ran (not only read), findings with
`file:line` and user effect, the mandatory performance section, what was not verified. A verdict for one head does not
carry over to another.

### Step 8 — QA verification

QA reviews the PR and runs its own checklist on a real build, then explores **beyond the checklist**: the full feature
and the bug path as a user, UI/UX consistency with the rest of the product, logic that is now out of sync with a sibling
flow, side effects on other screens, data left behind, error paths. Findings are reported as new issues (linked) or as
CHANGES on this one. QA posts `docs/process/templates/qa-verification.md` with PASS/FAIL, the build SHA it tested, each
acceptance item with expected/actual and evidence, and what it did not verify.

### Step 9 — Merge and close (lead)

The lead merges only when the gates are green: SA APPROVE (if engaged) and QA PASS, or an explicit owner override with
the reason. The merge is a fast-forward or a reviewed merge into the integration branch; `main` is promoted separately
with the release. The lead closes the issue with the merge SHA and the two verdict links. The close command refuses
without both gate labels.

### Step 10 — Release

A release issue/milestone gathers the merged issues, the runbook, the gate on the exact tree, the deploy, the Prod smoke
and the rehearsal. Issues merged but not released stay `status:merged`, not closed as "done in Prod".

## 4. When dev can decide, when SA is pulled in, when the lead decides

| Situation | Who decides |
|---|---|
| A checklist item needs a small deviation with the same observable result | Dev decides, notes it in the PR |
| A real behaviour change, a contract change, a data model change | SA (joint plan), lead confirms |
| Two SAs disagree | Lead decides; product/data/money impact → owner |
| QA finds a side effect outside the issue's scope | QA files a new issue; lead assigns |
| A finding blocks the release | Lead + owner decide fix-forward or rollback |
| Security, secrets, tenant data, billing, Prod window | Lead → owner, always |

## 5. Evidence rules

1. Every comment: **date/time, actor, pinned head SHA, what ran, result, artifact path**.
2. **Numbers, not adjectives** — counts, statuses, timings, token totals.
3. **Artifacts by path**; never paste a secret, key, token, password, seed or raw env dump. The automation refuses text
   that looks like a secret.
4. **Append-only.** Corrections are new comments; the record stays.
5. **A verdict pins a head.** If the head moves, the changed part is reviewed again.
6. **Not verified is stated** by the implementer, SA and QA alike.

## 6. Labels, milestones and automation

- `lane:<name>` · `area:<fixtures|generation|test-runs|worker|ai|ui>` · `P0–P3`
- `gate:sa-systems-approved`, `gate:sa-code-approved`, `gate:qa-passed` (+ their `-changes`/`-failed` pair)
- `status:ready-to-merge`, `status:merged`, `blocked`, `owner-override`
- Milestone per release.

Automation: `node scripts/issue-flow.mjs <command>` (needs the `gh` CLI with `repo` scope; GitHub Actions are not used
because Actions billing is blocked in this repository).

| Command | Effect |
|---|---|
| `setup-labels` | create the lane/area/priority/gate labels idempotently |
| `create --lane <name> --title "<...>" --body <file>` | open the issue |
| `evidence --issue N --file <report> --head <sha>` | scan for secrets, post the append-only evidence comment |
| `no-sa --issue N --reason "<...>"` | the lead records that SA is not required for this issue |
| `gate --issue N --role sa-systems\|sa-code\|qa --verdict ... --file <review>` | post the verdict, flip the gate label, set `status:ready-to-merge` when every required gate is green |
| `close --issue N --merge-sha <sha>` | refuse unless every required gate label exists, then close |
| `status` | the open board |

## 7. Templates

- `docs/process/templates/issue.md` — the issue body.
- `docs/process/templates/qa-acceptance.md` — QA's reproduction + acceptance criteria + developer checklist.
- `docs/process/templates/sa-systems-review.md` — system-level review and joint plan input.
- `docs/process/templates/sa-code-review.md` — code-structure review and joint plan input.
- `docs/process/templates/pr.md` — the pull request body.
- `docs/process/templates/qa-verification.md` — QA's post-build verification.
- `.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md` — the GitHub-native forms; they are read from the
  default branch, so they ride the next release train.
