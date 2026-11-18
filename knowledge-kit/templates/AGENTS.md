# AGENTS.md — <project name>

> One file for every coding agent. Keep it short: the commands, the map, the rules that would get a
> newcomer's pull request rejected. Details live behind the links.

## Read first

1. `docs/knowledge/index.md` — the map from a question to the file that answers it.
2. `docs/knowledge/modules/<module>.md` for the paths you will touch (`node knowledge-kit/scripts/knowledge.mjs impact <path>`).
3. The module's contract, when the repository has one.

Do not load the whole documentation tree. Read the page, not the history.

## Commands

```bash
# install
<install command>

# run locally
<dev command>            # <url / port>

# before you open a pull request
<typecheck command>
<test command>
<build command>
```

## Non-negotiables

- <the rule that has cost the most time here — write it as a sentence, with the failure it prevents>
- <the second one>
- Never paste a secret, key, token, password or raw environment into a file, a log, a comment or an artifact.

## Knowledge rule

A task ends with exactly one of these, in the task record and the pull request:

```
knowledge: updated docs/knowledge/modules/<module>.md
knowledge: none — <reason of at least twenty characters>
```

A behaviour, contract, data-model, configuration, error-path or user-flow change is never `none`. The merge
gate is `node knowledge-kit/scripts/knowledge.mjs gate --pr <n>`; the full rules are in
`knowledge-kit/RULES.md`.

## Where things are

| Question | File |
|---|---|
| What does this repository do? | `README.md` |
| Where is the truth about module X? | `docs/knowledge/index.md` |
| What did we decide, and why? | `docs/knowledge/decisions/` |
| What happened last week? | the task records |
| How do I deploy and roll back? | `<deploy doc>` |
