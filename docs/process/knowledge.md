# Project knowledge for xQA — the design

**Status:** DRAFT for SA review. **Owner:** lead. **Chosen direction:** B — index + canonical pages + append-only task
log + a merge gate (owner, 2026-11-17). The normative rules are `knowledge-kit/RULES.md`; this document is the
*why*, the adoption plan and the open questions.

## 1. The problem, with evidence

1. **The entry file already lies.** `af8fbbca7` deleted `IMPLEMENTATION_PLAN.md`, `app/architecture/PROGRESS.md`
   and `app/architecture/TRAPS.md`; `CLAUDE.md` still sends every cold-start agent to them (lines 13–14, 29–32,
   73–74, 89). A lane that follows §1 literally reads three files that do not exist and concludes it has the
   context it does not have.
2. **History is rich; current truth is not addressable.** `app/architecture/tasks/` holds 210 task folders,
   293 markdown files, 177 marked done, each with a goal, a self-test report and a log. There is no index and no
   page that says what is true *now* about a module; answering that means reading history.
3. **The reading cost is already documented.** `CLAUDE.md` §1b records a worst case of **600k tokens before a
   line is written**. That is the symptom of a corpus with no map, not of too little documentation.
4. **Nothing ties a merge to a knowledge update.** The contracts, the standards and the task records are good;
   no gate notices when a behaviour changed and the page behind it did not.

This is not a request for more documentation. It is a request for an **index, an update rule, and a machine that
notices drift** — on top of the material that already exists.

## 2. Goals, non-goals, anti-goals

**Goals**

- An agent starting a task reads ≤3 short files and knows where the truth is, what it may break, and what to test.
- A behaviour, contract, data-model or operational change cannot merge unless its knowledge page moved with it,
  or the author recorded a specific reason it did not.
- A page that is edited, linked and indexed but describes the old behaviour is caught by a reviewer at merge.
- The corpus is auditable: every claim points at a file, a table, an endpoint, a test or a probe.

**Non-goals**

- Replacing the contracts (`app/document/_api/**`), the standards, or the task records. They stay canonical for
  what they already own.
- Generating prose about the code. Generated reference stays generated; hand-written pages hold judgement.
- A vector database, an MCP knowledge server, or a semantic search layer. Deferred until the map is demonstrably
  too large (§10).

**Anti-goals** (a failure even if it "works")

- A second copy of a fact that can drift from the first.
- A gate that demands a filename change, teaching agents to make junk edits to pass.
- A page that grows until reading it is the expensive part — the exact failure `CLAUDE.md` §1b records.
- A knowledge system only the lead understands.

## 3. The model — five layers and one gate

```
            AGENTS.md  (entry, always loaded, < 150 lines)
                 │
                 ▼
   docs/knowledge/index.md  (the map: question → file → owner → verified)
                 │
     ┌───────────┼───────────────┬─────────────────┐
     ▼           ▼               ▼                 ▼
 contracts   standards     module pages       ADRs / decisions
 (_api/**)   (binding)     (present tense)    (why, supersession)
     │           │               │                 │
     └───────────┴───────┬───────┴─────────────────┘
                         ▼
        app/architecture/tasks/<NNN-ID>/  (append-only history)
                         │
                         ▼
        knowledge gate  (links · index · freshness · statement · task)
```

**Layer 0 — entry.** `AGENTS.md` at the root: commands, the map path, the non-negotiables, the knowledge rule.
It is provider-neutral (Codex, Claude, Cursor, Copilot read it); Claude-specific detail stays in `CLAUDE.md`,
which is corrected to point at the same map instead of the deleted files.

**Layer 1 — the map.** `docs/knowledge/index.md`: one row per fact — the question, the file, the owner, the head
at which it was verified. It is the internal equivalent of an `llms.txt` index: small, curated, and the first
read. It is generated in part (`knowledge index`) so it cannot silently omit a page.

**Layer 2 — canonical pages.** One page per module in `docs/knowledge/modules/<module>.md`: what it does now,
contracts, key files, invariants, traps, tests, owner, `verified`. Present tense. Target ≤150 lines; if it grows,
split by sub-behaviour rather than appending.

**Layer 3 — history.** The existing task records. They keep their shape and gain one required section:
`knowledge: updated <paths>` or `knowledge: none — <reason>`. Append-only; never rewritten.

**Layer 4 — decisions.** ADRs for architecture-class choices, linked from the page and the map. The repository
already has decision records in `54-manual-first.md`; new decisions get their own ADR so they can be superseded.

**Layer 5 — impact map.** `knowledge.config.json`: module → code paths → pages → tests. It powers
`knowledge impact <path>`, the gate's "did this change a mapped module?" check, and the module page's test list.
It is the only machine-readable map; everything else is markdown.

**The gate.** `knowledge-kit/scripts/knowledge.mjs`. Mechanical checks only: a valid statement, links resolve,
every page indexed, frontmatter has an owner and a verification, no code changed after `verified`, task records
carry the knowledge line. Truth is the reviewer's job (§6).

## 4. Where each kind of fact lives

| Kind of fact | Home | Tense | Example |
|---|---|---|---|
| What the system promises | `app/document/_api/**` | present / normative | an endpoint, a refusal code, a table |
| How code must be written | `app/architecture/standards/**` | imperative | "one behaviour per module" |
| What is true about a module now | `docs/knowledge/modules/<module>.md` | present | "the gate reads the role id, not the name" |
| Why a choice was made | `docs/knowledge/decisions/ADR-…` | past + binding | "we chose expand-then-contract because…" |
| What happened in a task | `app/architecture/tasks/…` | past, append-only | "ran 41 specs; 2 failed; fixed at…" |
| Where to look next | `docs/knowledge/index.md` | index | "fixtures → modules/fixtures.md" |
| Which paths a module owns | `knowledge.config.json` | machine map | `server/src/modules/fixtures/**` |

The rule that keeps this from becoming five copies of the same paragraph: **a fact lives in exactly one of
these rows, and the others point at it.**

## 5. Definition of done, extended

A task is done when, in addition to the existing gates:

1. its task record carries `knowledge: updated <paths>` or `knowledge: none — <reason ≥20 chars>`;
2. the PR body carries the same line;
3. for a mapped module whose code changed, the module page is in the diff and `verified` was stamped at a head
   with no later code change in that module;
4. a new decision has an ADR, a contract change is in the contract, a new page has an index row;
5. `knowledge gate --pr <n>` exits 0.

`none` is a claim the reviewer checks, not a loophole.

## 6. Merge and review in an AI-only team

The team is AI lanes plus the lead; the temptation is to automate the whole check and skip the reading. The design
splits it deliberately:

- **The gate is mechanical and blocking.** It answers "is there a statement, does it resolve, is the page indexed,
  was it verified after the code moved?". A red gate blocks the merge; it is cheap, deterministic, and cannot be
  talked out of.
- **The review is judgement and also blocking.** The reviewer (`knowledge-reviewer` skill) answers "is the sentence
  true at this head, is `none` honest, is a second copy of the rule now in the tree?". A PASS that only repeats the
  gate's output is not a review.

**Why not fail on "docs changed?" for every path**: many changes legitimately need no page edit (a test-only
change, a rename), and a hard fail teaches agents to touch a file to satisfy the bot. The `none — reason` form is
the pressure valve, and its abuse is exactly what the reviewer is trained to catch.

**Waivers** are written (`knowledge: waived — <reason>`) and need the lead or the owner. A waiver is visible on
the PR forever; it is not a label that can be quietly applied.

**Who reviews**: QA owns the factual check (it already verifies the build); SA-Code owns duplication and module
shape; SA-Systems owns contract/data/perf claims. The lead runs the gate at merge and does not accept a PASS that
only quotes it.

## 7. Adoption — incremental, by touch

The owner's instruction is explicit: do not sweep the whole repository; load knowledge as work touches it.

**Phase 1 — this branch (no full sweep)**

- the kit (`knowledge-kit/`), its two skills, the config with the three hotfix modules
  (`fixtures`, `generation`, `test-runs`);
- `AGENTS.md` and `docs/knowledge/index.md`;
- three module pages started from what this hotfix actually established, each marked `verified: pending` until a
  lane reads it against the code;
- `CLAUDE.md` §1 corrected: the deleted files are named as deleted, and the map is the route;
- the merge rule wired into the lead's checklist and the PR template.

**Phase 2 — every task from now on**

A module page is created **the first time a task touches that module**, not before. The task that creates it owns
it and stamps `verified`. No page exists for a module nobody has touched; an absent page is honest, a guessed page
is not.

**Phase 3 — after roughly ten pages**

Regenerate the index, review the map for gaps, and decide whether the map or the pages have outgrown the
"≤3 files to start" goal. Only then consider an index service.

## 8. Portability

`knowledge-kit/` is vendor-neutral and dependency-free (git + Node). To use it on another project: copy the
folder, run `init`, fill `AGENTS.md` and the map, add one module, copy the two skills into the agent's skill
directory, and wire `gate --pr <n>` into the merge command. Nothing in it names xQA, a provider, or a CI vendor.
The kit's `README.md` is the ten-minute adoption path.

## 9. Risks and mitigations

| Risk | Why it is real here | Mitigation |
|---|---|---|
| Stale `verified` | a page stamped once and never re-read | the gate diffs the mapped paths from `verified..HEAD` and refuses |
| False `none` | the cheapest way to pass the gate | the reason is mandatory; the reviewer checks it against the diff; a false none is a blocking finding |
| Duplicate truth | two agents write the same rule in a page and a contract | one-fact-one-place rule; SA-Code review explicitly looks for the second copy |
| Concurrent edits | two lanes touch the same module page in one release | one owner per page; small pages; the lead resolves a semantic conflict with SA, never a blind merge |
| Secret in a knowledge file | task records and pages quote commands | the gate scans; the reviewer looks; the issue-flow scanner already refuses secrets |
| Token cost of the map | an index that grows like `PROGRESS.md` did | map ≤200 lines; module page ≤150; split rather than append; the first read is the map, not the corpus |
| Adoption fatigue | 210 task records and 30 modules | Phase 2: page on first touch only; `taskKnowledgeSince` keeps old records out of the check |
| Agent writes plausible nonsense | an LLM can fill a template confidently | `verified: pending` until a lane reads it; reviewer checks claims against code; no page for untouched modules |

## 10. What we deliberately do not build now

- **A memory bank** (six summary files): it duplicates the contract/standards/pages and rots fastest where it is
  read most.
- **A vector index / MCP server** (Basic Memory, Graphiti, …): useful when the map is too large to grep, but
  embeddings are hard to review in a PR and add a service to operate. The plain files stay the source of truth if
  we add one later.
- **Auto-generated module prose**: generated *reference* (OpenAPI, schema) is fine; generated *judgement* is how a
  page ends up confidently wrong.
- **A gate that demands a doc edit for every code change**: it produces token edits, not knowledge.

## 11. Open questions for SA and the owner

1. **Blocking from day one?** The gate blocks a merge with no statement or a stale page. Should the first two weeks
   warn only (exit 0) to calibrate, or block immediately because the team is small?
2. **Owner of a shared page.** When two lanes touch one module in a release, is the owner the last lane to verify,
   or the lane that owns the module? The design says last-to-verify; the alternative is a stable owner per module.
3. **`verified` semantics.** The design uses the last checked head and refuses if mapped code changed after it. The
   alternative is to require `verified == merge head`, which forces a re-stamp after every rebase.
4. **Candidate pages.** Are `fixtures`, `generation`, `test-runs` the right first three, or should one be a smaller
   module to test the shape cheaply?
