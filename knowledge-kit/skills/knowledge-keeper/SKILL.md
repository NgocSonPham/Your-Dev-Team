---
name: knowledge-keeper
description: >-
  Keep a repository's project knowledge true while doing a task: read the knowledge map before touching code,
  then update the canonical module page, the task record and the index when the behaviour changes — or record
  an explicit knowledge-neutral reason. Use this whenever a task changes behaviour, a contract, a table, a
  migration, a configuration default, an error path, a user flow or an operational procedure, and whenever
  someone asks where something is documented or asks you to update the docs.
---

# The knowledge-keeper seat

You are the person who makes the next agent's first ten minutes correct. The repository you are in keeps its
truth in a small set of files; your job is to leave them true when you finish, without copying the same fact
into two places.

Read `knowledge-kit/RULES.md` once. It is short and normative.

## 1. Before you touch code

1. **Entry file** (`AGENTS.md` or the repo's equivalent): commands, non-negotiables.
2. **The map** (`docs/knowledge/index.md`): find the row for what you are about to change.
3. **Impact**, for each path you expect to edit:

   ```bash
   node knowledge-kit/scripts/knowledge.mjs impact <path>
   ```

   It prints the module, the canonical page and the tests. If it prints "no module maps this path", that is
   the first finding of the task: either add the map entry, or write down why the path is genuinely unmapped.
4. **The module page**, then the contract it points at — not the whole documentation tree.

Read for the invariants and the traps, not for background. If the page contradicts the code, the page is
wrong; correct it as part of the task and say so in the task record.

## 2. While you work

- When a bug costs you more than a few minutes, write the **symptom → cause → test** row into the module
  page's **Traps** while it is fresh. That row is the most valuable thing you will write all day.
- When you discover a fact that two future tasks will need (a refusal code, a default, an ordering rule),
  write it where it belongs: contract, module page, or ADR — one of them, not all three.
- Do not invent a new document for a fact that already has a page.

## 3. When you finish

Choose exactly one:

**A. The knowledge changed.**

```bash
# edit the module page: what is true now, the invariant, the trap, the tests
node knowledge-kit/scripts/knowledge.mjs verify <module>      # stamps verified: <HEAD>
```

Then write the task record's section:

```
knowledge: updated docs/knowledge/modules/<module>.md
```

**B. The knowledge did not change.**

```
knowledge: none — test-only change; no behaviour, contract or data model altered
```

The reason must be true and specific. "none" alone, or "minor", is refused by the gate. If the change is
visible to a user, to another module, or to an operator, it is not `none`.

Both forms also go in the pull request body. The merge gate reads the PR body or `--statement`.

## 4. What "updated" means

- The **module page** is present tense: "the gate reads the database, not the display name". Not a changelog.
- The **task record** is append-only: what you did, the counts, the artifact paths, what you did not verify.
- The **index** gains a row only for a new page; `node knowledge-kit/scripts/knowledge.mjs index` regenerates
  the module table.
- A **new decision** gets an ADR, linked from the page and the index.
- A **contract change** lands in the contract in the same change, not only in the page.

Never paste a secret, key, token, password or raw environment into any of these files.

## 5. Done means the gate says so

```bash
node knowledge-kit/scripts/knowledge.mjs gate --statement "knowledge: updated <paths>"
```

It checks the links, the index membership, the freshness of `verified`, the statement, and the task record.
Exit 0 is the definition of done; do not report "documented" before it.

## Red lines

- Do not duplicate a fact into a second file "for safety". Two copies drift, and the second one wins by
  accident.
- Do not mark `verified` without reading the page against this head.
- Do not describe what used to be true in a canonical page.
- Do not delete a correct promise because the code does not implement it yet; record the gap with an owner.
- Do not let a behaviour change pass as `knowledge: none`.
