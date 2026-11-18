---
id: <module>
title: <Module name>
owner: <seat or person who last verified this page>
verified: pending
verified-at: <YYYY-MM-DD>
stability: evolving
---

# <Module name>

> One sentence: what this module is for, in the product's words.

## What it does

The behaviour a user or another module can rely on. Present tense. Two or three short paragraphs at most.

## Contracts

| Surface | Where | Notes |
|---|---|---|
| API | `app/document/_api/<module>/openapi.yaml` | |
| Rules | `app/document/_api/<module>/domain-rules.md` | |
| Tables | `app/document/_api/<module>/erd.md` | |

## Key files

| File | Why it matters |
|---|---|
| `path/to/module.ts` | the one place this behaviour lives |

## Invariants

Things that must stay true, each with the test or probe that would fail if they stopped being true.

1. <invariant> — pinned by `<test name / path>`.

## Traps

Symptom → cause → where it is pinned. Add a row every time a bug costs more than an hour.

| Symptom | Cause | Pinned by |
|---|---|---|
| | | |

## Tests

| Suite | Command | What it covers |
|---|---|---|
| | | |

## Knowledge log

Append-only, newest last. One line per change: date, head, what changed in this page and why.

- <YYYY-MM-DD> · `<sha7>` · created
