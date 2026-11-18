# The knowledge rules

These are the normative rules. The design and the adoption plan are in
`docs/process/knowledge.md`; the mechanical checks are in `scripts/knowledge.mjs`.

## 1. Read before you touch

Every agent, at the start of a task, reads in this order:

1. the entry file (`AGENTS.md`) — commands, constraints, non-negotiables;
2. `docs/knowledge/index.md` — the map from a question to the file that answers it;
3. the module page(s) for the paths it will touch (`knowledge impact <path>`);
4. the contract for that module, when it has one.

It does not read the whole tree. The map exists so it reads the page, not the history.

## 2. Update after you finish

Every task ends with **exactly one** of these, written in the task record and in the PR:

```
knowledge: updated docs/knowledge/modules/<module>.md, docs/knowledge/index.md
```

```
knowledge: none — test-only change; no behaviour, contract or data model altered
```

The `none` form carries a reason of at least twenty characters. "none" alone is refused. A change to
behaviour, a contract, a table, a migration, a configuration default, an error path, a user-visible flow, or
an operational procedure is never `none`.

What to write, by kind:

| The change | Update |
|---|---|
| behaviour or a user-visible flow | the module page: what is true now, the invariant, the trap |
| a contract, table, migration, enum | `app/document/_api/**` (the repo's own contract rule) + the module page |
| an architecture decision | an ADR, linked from the module page and the index |
| a new module, service or boundary | a new module page, a map row, the config entry |
| a test that encodes a trap | the module page's **Traps** section: symptom → cause → test |
| a procedure (deploy, rehearsal, rollback) | the runbook, and the module page's pointer |
| a mechanical rename or a test-only change | `knowledge: none — <reason>` |

## 3. Rules of the writing

1. **One fact, one place.** The module page states what is true. The task record states what happened. The
   contract states what the system promises. Never copy a fact into two of them.
2. **Canonical pages are present tense.** "The gate reads the database, not the name." If it describes what
   used to be true, it belongs in the task log or an ADR, not in the page.
3. **Task records are append-only.** Add a line; never rewrite yesterday's log. Supersede with a new entry.
4. **Numbers, not adjectives.** Counts, paths, statuses, timings. "Faster" is not a fact.
5. **Every claim has a pointer.** `file:line`, a table name, an endpoint, a probe. A sentence nobody can
   check is a sentence that will drift.
6. **No secret, key, token, password, or raw environment** in any knowledge file, task record or index row.
   The gate refuses text that looks like one.
7. **`verified:` means checked, not edited.** The SHA is the head at which a person or agent read the page
   against the code/build and confirmed it. Bump it with `knowledge verify <module>` after the build is green.
8. **A page that names a retired thing is a defect.** Do not delete the sentence silently; correct it and
   keep the correction visible in the task log.

## 4. The merge rule

A merge happens only when all of these hold, on the exact head:

1. **A knowledge statement** in the PR body — `updated <paths>` or `none — <reason>`.
2. **`node knowledge-kit/scripts/knowledge.mjs gate --pr <n>` exits 0.** It checks links, index membership,
   freshness, the statement, and the task record.
3. **A changed module carries its page.** If mapped code changed, `docs/knowledge/modules/<module>.md` is in
   the diff and its `verified` SHA has no code change after it.
4. **A new or changed decision has an ADR**, linked from the page and the index.
5. **A contract change is in the contract**, in the same PR — not only in the module page.
6. **A reviewer confirmed the claim**, not the filename: they opened the page against the build or the code
   on the pinned head and said so in the review (see §5).
7. **No secret** in the knowledge delta.

Waiving a rule needs the lead or the owner, in writing, with a reason (`knowledge: waived — <reason>`), on
the PR. A waiver is a decision, not a routine escape.

## 5. The review rule

The reviewer reviews the knowledge delta **as code**:

- Every changed claim: does it match this head? Open the file, the route, the table, the screen — not the PR
  summary.
- Is the page present tense, or is it a changelog that will rot?
- Did the change add a second copy of a rule that already lives in a contract, a standard or another page?
- Does the page name a file, symbol, endpoint or table that still exists?
- Is `verified` the head that was actually checked? A page verified at an older SHA with code changed after
  it is **CHANGES**, not "done".
- Is the `none` reason true? A behaviour change described as "test-only" is the failure this rule exists for.
- Did the index gain a row for a new page, and lose none for a deleted one?

The reviewer's verdict names the page and the claim: `docs/knowledge/modules/fixtures.md:34 says X; the code
at server/…:120 does Y`. "Docs updated" as a filename list is not a review.

## 6. Ownership

Every module page has one `owner` — the seat that touched it last, not a committee. The owner is asked when
the page is stale. A page with no owner is a page nobody will correct; the gate refuses it.

## 7. What the gate cannot do

It cannot tell whether a sentence is true. It cannot see a fact that was never written. It cannot stop a
reviewer from rubber-stamping. Those are the reasons §5 exists, and the reason the review is a seat, not a
checkbox.
