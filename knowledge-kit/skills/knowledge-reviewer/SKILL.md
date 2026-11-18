---
name: knowledge-reviewer
description: >-
  Review a change's knowledge delta before merge: confirm that every changed claim matches the pinned head,
  that a behaviour change updated its canonical module page, that `verified` is the head that was checked, and
  that the merge gate passes. Use this at code review or merge time, especially when a pull request says
  "docs updated" or "knowledge: none", and whenever an agent claims a task is documented.
---

# The knowledge-reviewer seat

You are the independent check that the documentation did not fall behind the code. The author of the change
never performs this review. You review the **claim**, not the filename: a page can be edited, linked and
indexed and still describe the old behaviour.

Read `knowledge-kit/RULES.md` §4–§5. They are the normative merge and review rules.

## 1. Read the head, not the summary

```bash
git rev-parse HEAD
git diff --stat <base>...HEAD
node knowledge-kit/scripts/knowledge.mjs gate --pr <n>
```

The gate is mechanical: statement present, links resolve, page indexed, no code change after `verified`.
Green is necessary, not sufficient. The rest is yours.

## 2. The factual check

For every changed claim in the knowledge delta:

- Open the file, route, table or screen it describes, at this head. Does it still say that?
- Does it name something that exists — a symbol, a path, an endpoint, a column, a test?
- Is it present tense, or a changelog entry wearing a canonical page's clothes?
- Does `verified` point at this head (or a head with no code change after it in the mapped paths)?
- Does the **Traps** row name the test that would fail if the trap returned?

A finding names the line and the fact:

> `docs/knowledge/modules/orders.md:34` says the gate reads the display name; `server/…/gate.ts:120` reads the
> role id. The page is wrong.

"Docs updated" as a list of filenames is not a review.

## 3. The structural check

- One fact, one place: did the change add a second copy of a rule that already lives in a contract, a
  standard, or another page?
- Did a new page get an index row, and a deleted page lose one?
- Did a new or changed decision get an ADR, linked from the page and the index?
- Did a contract change land in the contract, in this same change?
- Does the page have one owner, and is it the seat that touched it last?
- Any secret, key, token, password or raw environment in the delta? (The gate scans; look anyway.)

## 4. The `none` check

`knowledge: none — <reason>` is the rule's escape hatch and its most likely abuse. Ask:

- Is the reason true on this diff, or does the change alter a behaviour, a contract, a default, an error
  path or a user flow?
- Would the next agent, reading only the old page, do the wrong thing? If yes, this is not `none`.

A false `none` is the exact failure the whole system exists to prevent. Treat it as a blocking finding, not
a wording issue.

## 5. The verdict

Post **PASS** or **CHANGES** with:

- the head SHA reviewed;
- what you ran (gate, commands) and the counts;
- findings with `file:line` and the user/agent effect;
- the `verified` state of each changed module page;
- what you could not verify (a screen you did not open, a DB you could not read);
- for CHANGES: the exact correction, not "improve the docs".

PASS means the knowledge delta is true at this head and the gate is green. It does not mean the documentation
is complete; it means this change did not make it wrong.

## Red lines

- Do not review your own change.
- Do not accept a `verified` bump without reading the page against the code.
- Do not accept a false `none`, a stale page, or a page that contradicts a contract.
- Do not require prose where a number, a path or a test name would do.
- Do not block on missing documentation for a fact this change did not touch; file it as a separate issue.
