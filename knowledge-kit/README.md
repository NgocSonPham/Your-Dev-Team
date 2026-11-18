# knowledge-kit — keep a repository's knowledge true, at merge time

A small, dependency-free kit for teams of humans and agents. It gives a repository:

- **one entry file** (`AGENTS.md`) that every provider reads first;
- **one map** (`docs/knowledge/index.md`) from a question to the file that answers it;
- **one canonical page per module** (`docs/knowledge/modules/<module>.md`) describing what is true *now*;
- **an append-only task log** (`app/architecture/tasks/…`) recording what happened and why;
- **a merge gate** that refuses when code changed and the knowledge did not.

It does **not** write your documentation, and it does **not** verify that a sentence is true. It verifies the
mechanical part — the file exists, the link resolves, the page is indexed, and somebody re-verified it after
the code it describes last moved — and leaves the truth check to the reviewer, on a pinned head.

## The idea in one line

> One fact, one place; history is append-only; the merge is where the two must agree.

The full operating rules are in [`RULES.md`](./RULES.md). The two skills are in
[`skills/`](./skills/). The script is `scripts/knowledge.mjs` (Node 18+, no dependencies).

## Layout

```
knowledge-kit/
├── README.md              this file
├── RULES.md               read-before, update-after, merge rule, review rule
├── knowledge.config.json  the map: module → code paths, pages, tests
├── templates/
│   ├── AGENTS.md          the entry file
│   ├── index.md           the map, with a generated module table
│   ├── module.md          one canonical page
│   ├── task.md            one append-only task record
│   ├── adr.md             one decision record
│   └── knowledge.config.json
├── skills/
│   ├── knowledge-keeper/SKILL.md    the dev lane's obligation
│   └── knowledge-reviewer/SKILL.md  the reviewer's check at merge
└── scripts/knowledge.mjs  init · check · gate · impact · verify · new-task · status · index
```

## Adopt it in ten minutes

```bash
# 1. copy the folder into the repository, then:
node knowledge-kit/scripts/knowledge.mjs init

# 2. edit AGENTS.md (commands, map path, non-negotiables)
#    and docs/knowledge/index.md (the canon table)
# 3. add ONE module page from templates/module.md and list it in knowledge.config.json

node knowledge-kit/scripts/knowledge.mjs status
node knowledge-kit/scripts/knowledge.mjs check
```

Copy `skills/knowledge-keeper` and `skills/knowledge-reviewer` into your agent's skill directory
(`.claude/skills/`, or any directory the tool loads). They are plain `SKILL.md` files with frontmatter; they
carry no project-specific facts.

## Commands

| Command | What it does | Exit |
|---|---|---|
| `init [--into <repo>]` | creates the config, the index, `AGENTS.md`; never overwrites | 0 |
| `check [--strict] [--base <ref>]` | links, frontmatter, index membership, freshness, task records | 1 on structural errors |
| `gate --statement "<knowledge: …>"` \\| `--pr <n>` | the merge rule: a valid statement, a strict check, and a changed module must carry its page | 1 on refusal |
| `impact <path>…` | which module, docs and tests a path reaches | 0 |
| `verify <module-id\\|doc> [--sha]` | stamps `verified:` with the head that was checked | 0 |
| `new-task <ID> --title "<t>" [--dir <NNN-ID>]` | scaffolds a task record with the `knowledge:` section | 0 |
| `status` | pages, pending verification, modules, tasks missing the knowledge line | 0 |
| `index` | regenerates the module table between the markers in `index.md` | 0 |

## What the gate actually enforces

1. Every module page has `owner` and `verified` frontmatter.
2. Every module page is listed in `docs/knowledge/index.md`.
3. Every relative markdown link in the knowledge tree (and the entry files) resolves.
4. If a mapped code path changed, its page changed too — or the PR says `knowledge: none — <reason>`.
5. No code changed between a page's `verified` SHA and HEAD; otherwise the page must be re-verified.
6. Task records updated after `taskKnowledgeSince` carry a `knowledge:` line.

It cannot enforce "the page says the right thing". That is the reviewer's job, and the review rule says so
explicitly.

## Portability

Nothing in the kit is tied to a language, framework, CI provider, or agent vendor. It needs `git` and Node.
The only convention it assumes is that documentation lives in the repository and is reviewed with the code.
If your CI blocks pull requests, run `gate` from the merge command, a pre-push hook, or the lead's merge
checklist — the exit code is the same.

## What this kit is not

- **Not a memory bank.** It does not ask for six summary files that duplicate the docs you already have.
- **Not a semantic search service.** No embeddings, no MCP server. Grep plus a map is enough until the map is
  demonstrably too large; then add an index on top of the same plain files.
- **Not a documentation generator.** Generated reference (OpenAPI, schemas) stays generated; this kit indexes
  it and refuses when a hand-written page behind it drifts.
