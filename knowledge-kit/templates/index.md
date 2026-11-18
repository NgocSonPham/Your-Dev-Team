# Project knowledge — the map

> The first read for any agent or person. One row per fact: the question it answers, the file that answers it,
> the owner and the head at which it was last checked. If a row points at something that no longer exists,
> the row is wrong — fix it in the same task.

## Canon — where the truth lives

| Question | File | Owner | Verified |
|---|---|---|---|
| What is this project, for whom? | `README.md` | | |
| What is true about module `<x>` right now? | `docs/knowledge/modules/<x>.md` | | |
| What does the API promise? | `<the contract directory>` | | |
| Which coding rules are binding? | `<the standards directory>` | | |
| What did we decide, and why? | `docs/knowledge/decisions/` | | |

## Modules

Each page is present tense: what is true now, the invariants, the traps, the tests that pin them.

<!-- knowledge:index:start -->
| Page | Path | Owner | Verified |
|---|---|---|---|
<!-- knowledge:index:end -->

## Reading by task

| You are about to | Read |
|---|---|
| change a module's behaviour | its module page, its contract, its tests |
| add a table, column or migration | the ERD, the domain rules, the module page |
| touch a provider, worker or queue boundary | the module page's **Invariants**, the deploy/runbook doc |
| make an architecture choice | the ADRs that touch it; write a new one if none does |
| debug something strange | the module page's **Traps**, then the task records |

## Known drift

A place where a document is known to disagree with the code. Each row has an owner and an issue; the row is
removed only when the document is corrected.

| What | Where | Owner | Issue |
|---|---|---|---|
| | | | |
