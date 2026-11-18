#!/usr/bin/env node
/**
 * knowledge — a portable project-knowledge gate for human + agent teams.
 *
 * The repository owns the truth; this script keeps the index honest and makes a merge
 * refuse when a behaviour change left the knowledge behind. It cannot check whether a
 * sentence is TRUE — only that it exists, resolves, is indexed, and was verified after
 * the code it describes last moved. The reviewer checks the truth.
 *
 *   node knowledge-kit/scripts/knowledge.mjs init [--into <repo>]
 *   node knowledge-kit/scripts/knowledge.mjs check [--strict] [--base <ref>]
 *   node knowledge-kit/scripts/knowledge.mjs gate --statement "knowledge: updated <paths>" | --statement "knowledge: none — <reason>"
 *   node knowledge-kit/scripts/knowledge.mjs gate --pr 42
 *   node knowledge-kit/scripts/knowledge.mjs impact <path> [<path>...]
 *   node knowledge-kit/scripts/knowledge.mjs verify <module-id|doc> [--sha <sha>]
 *   node knowledge-kit/scripts/knowledge.mjs new-task <ID> --title "<title>" [--dir <NNN-ID>]
 *   node knowledge-kit/scripts/knowledge.mjs status
 *   node knowledge-kit/scripts/knowledge.mjs index
 *
 * No dependencies. Node 18+.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(KIT, 'templates');
const CONFIG = 'knowledge.config.json';

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/sk-[A-Za-z0-9_-]{20,}/, 'sk- API key'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained token'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*['\"]?[^\s'\"]{10,}/i, 'credential assignment'],
  [/Bearer\s+[A-Za-z0-9._-]{20,}/, 'bearer token'],
];

const argv = process.argv.slice(2);
const command = argv[0];
const has = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

let errors = 0;
let warnings = 0;
const fail = (message) => { errors += 1; console.error(`ERROR  ${message}`); };
const warn = (message) => { warnings += 1; console.warn(`WARN   ${message}`); };
const note = (message) => console.log(`       ${message}`);

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
}

function repoRoot() {
  return git(['rev-parse', '--show-toplevel']);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadConfig(root) {
  const path = join(root, CONFIG);
  if (!existsSync(path)) {
    console.error(`knowledge: ${CONFIG} not found in ${root}. Run: node knowledge-kit/scripts/knowledge.mjs init`);
    process.exit(2);
  }
  const config = readJson(path);
  config.entryFiles ??= ['AGENTS.md'];
  config.knowledgeDir ??= 'docs/knowledge';
  config.tasksDir ??= 'app/architecture/tasks';
  config.baseRef ??= 'origin/main';
  config.modules ??= [];
  return config;
}

function rel(root, path) {
  return relative(root, path).split(sep).join('/');
}

function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (pair) out[pair[1]] = pair[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function bodyAfterFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      out += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (char === '*') out += '[^/]*';
    else if (char === '?') out += '[^/]';
    else if ('\\^$.|+()[]{}'.includes(char)) out += `\\${char}`;
    else out += char;
  }
  return new RegExp(`^${out}$`);
}

function matchesAny(path, globs = []) {
  const posix = path.split(sep).join('/');
  return globs.some((glob) => globToRegExp(glob).test(posix));
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function markdownFiles(dir) {
  return walk(dir).filter((f) => f.endsWith('.md'));
}

function changedFiles(root, base) {
  const diff = git(['diff', '--name-only', `${base}...HEAD`], { allowFail: true });
  if (diff === null) return null;
  return diff.split('\n').filter(Boolean);
}

function statementFromPr(number) {
  const raw = execFileSync('gh', ['pr', 'view', String(number), '--json', 'body,headRefOid,number'], { encoding: 'utf8' });
  const pr = JSON.parse(raw);
  const line = (pr.body ?? '').split(/\r?\n/).find((l) => /^\s*knowledge\s*:/i.test(l));
  return { statement: line?.trim(), head: pr.headRefOid, number: pr.number };
}

function parseStatement(text) {
  const match = /^\s*knowledge\s*:\s*(.+)$/i.exec(text ?? '');
  if (!match) return null;
  const rest = match[1].trim();
  const none = /^none\b/i.exec(rest);
  if (none) {
    const reason = rest.replace(/^none\b[\s:—-]*/i, '').trim();
    return { kind: 'none', reason, raw: rest };
  }
  const updated = /^updated?\b/i.exec(rest);
  if (updated) {
    const paths = rest.replace(/^updated?\b[\s:—-]*/i, '').split(/[,\s]+/).filter((p) => p.includes('/'));
    return { kind: 'updated', paths, raw: rest };
  }
  return { kind: 'invalid', raw: rest };
}

function checkStructure(root, config) {
  const knowledgeDir = join(root, config.knowledgeDir);
  const indexPath = join(knowledgeDir, 'index.md');
  if (!existsSync(indexPath)) fail(`missing ${config.knowledgeDir}/index.md — the map is the entry point`);
  const index = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  const modulesDir = join(knowledgeDir, 'modules');

  for (const file of markdownFiles(modulesDir)) {
    const doc = rel(root, file);
    if (!index.includes(doc) && !index.includes(relative(knowledgeDir, file))) {
      fail(`${doc} is not listed in ${config.knowledgeDir}/index.md`);
    }
    const fm = frontmatter(readFileSync(file, 'utf8'));
    if (!fm.owner) fail(`${doc} has no owner in its frontmatter`);
    if (!fm.verified) fail(`${doc} has no verified: field (a SHA, a date, or "pending")`);
    if (fm.verified === 'pending') warn(`${doc} is still marked verified: pending`);
  }

  const docs = [...markdownFiles(knowledgeDir), ...config.entryFiles.map((f) => join(root, f)).filter(existsSync)];
  for (const file of docs) {
    const text = readFileSync(file, 'utf8');
    const from = dirname(file);
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|tel:|#)/i.test(target)) continue;
      const path = target.split('#')[0];
      if (!path) continue;
      const resolved = isAbsolute(path) ? path : resolve(from, path);
      if (!existsSync(resolved)) fail(`broken link in ${rel(root, file)}: ${target}`);
    }
  }
}

function checkFreshness(root, config, base) {
  const changed = base ? changedFiles(root, base) : null;
  if (changed === null) {
    warn(`cannot diff against ${base} — freshness checks skipped (fetch the base ref)`);
    return { misses: [] };
  }
  const misses = [];
  for (const mod of config.modules) {
    const codeChanged = changed.some((f) => matchesAny(f, mod.paths ?? []));
    if (!codeChanged) continue;
    const docsChanged = changed.some((f) => (mod.docs ?? []).includes(f));
    if (!docsChanged) misses.push(mod.id ?? mod.docs?.[0] ?? 'unnamed');
    for (const doc of mod.docs ?? []) {
      const path = join(root, doc);
      if (!existsSync(path)) { fail(`module ${mod.id}: ${doc} does not exist`); continue; }
      const fm = frontmatter(readFileSync(path, 'utf8'));
      if (fm.verified && fm.verified !== 'pending' && /^[0-9a-f]{7,40}$/i.test(fm.verified)) {
        const after = git(['diff', '--name-only', `${fm.verified}..HEAD`, '--', ...(mod.paths ?? [])], { allowFail: true });
        if (after === null) warn(`${doc}: verified SHA ${fm.verified} is not in this clone; cannot confirm freshness`);
        else if (after.trim()) fail(`${doc}: code changed after verified ${fm.verified.slice(0, 7)} — re-verify at HEAD`);
      }
    }
  }
  if (misses.length) warn(`code changed without its knowledge page: ${misses.join(', ')}`);
  return { misses };
}

function checkSecrets(root, files) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const [re, name] of SECRET_PATTERNS) {
      if (re.test(text)) fail(`${rel(root, file)} looks like it contains a ${name} — link the artifact instead`);
    }
  }
}

function checkTasks(root, config) {
  const tasksDir = join(root, config.tasksDir);
  if (!existsSync(tasksDir)) return;
  const since = config.taskKnowledgeSince;
  const files = markdownFiles(tasksDir);
  let checked = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const fm = frontmatter(text);
    const updated = fm.updated ?? '';
    if (since && updated && updated < since) continue;
    if (!since) continue;
    checked += 1;
    if (!/^knowledge\s*:/im.test(text) && !/^##\s+Knowledge\b/im.test(text)) {
      warn(`${rel(root, file)} has no knowledge: line (updated ${updated || 'unknown'})`);
    }
  }
  if (checked === 0) note(`no task records updated since ${since}`);
}

function runCheck(root, config, base, { strict = false, allowMiss = false } = {}) {
  checkStructure(root, config);
  const { misses } = checkFreshness(root, config, base);
  checkTasks(root, config);
  const changed = base ? changedFiles(root, base) : null;
  checkSecrets(root, changed ? changed.map((f) => join(root, f)).filter((f) => f.endsWith('.md')) : markdownFiles(join(root, config.knowledgeDir)));
  if (strict && misses.length && !allowMiss) {
    for (const miss of misses) fail(`knowledge miss: ${miss} changed without a documentation update and no knowledge: none statement`);
  }
  return { misses };
}

function init() {
  const root = resolve(opt('into', process.cwd()));
  process.chdir(root);
  const configPath = join(root, CONFIG);
  if (existsSync(configPath)) {
    note(`${CONFIG} already exists — leaving it untouched`);
  } else {
    const config = JSON.parse(readFileSync(join(TEMPLATES, 'knowledge.config.json'), 'utf8'));
    const remote = git(['remote'], { allowFail: true });
    if (!remote || !remote.split('\n').includes('origin')) {
      config.baseRef = 'HEAD';
      note('no origin remote — baseRef set to HEAD; change it to the integration ref before enabling the gate');
    }
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    note(`wrote ${CONFIG}`);
  }
  for (const dir of ['docs/knowledge/modules', 'docs/knowledge/decisions']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  const copies = [
    ['index.md', 'docs/knowledge/index.md'],
    ['AGENTS.md', 'AGENTS.md'],
  ];
  for (const [from, to] of copies) {
    const target = join(root, to);
    if (existsSync(target)) { note(`${to} already exists — leaving it untouched`); continue; }
    writeFileSync(target, readFileSync(join(TEMPLATES, from), 'utf8'));
    note(`wrote ${to}`);
  }
  console.log(`
Next:
  1. Edit AGENTS.md: the commands, the map path, the non-negotiables.
  2. Fill docs/knowledge/index.md and add one page per module from templates/module.md.
  3. List the module paths and their pages in ${CONFIG}.
  4. Copy knowledge-kit/skills/* into .claude/skills/ (or your agent's skill directory).
  5. Wire the gate into the merge command:
       node knowledge-kit/scripts/knowledge.mjs gate --pr <number>
  6. Run: node knowledge-kit/scripts/knowledge.mjs status`);
}

function gate() {
  const root = repoRoot();
  const config = loadConfig(root);
  let statement = opt('statement');
  const prNumber = opt('pr');
  let head = null;
  if (prNumber) {
    const pr = statementFromPr(prNumber);
    statement = statement ?? pr.statement;
    head = pr.head;
    const local = git(['rev-parse', 'HEAD']);
    if (head && head !== local) warn(`PR head ${head.slice(0, 7)} is not local HEAD ${local.slice(0, 7)} — gate the pushed head`);
  }
  if (!statement && opt('statement-file')) statement = readFileSync(opt('statement-file'), 'utf8');

  const parsed = parseStatement(statement);
  if (!parsed) {
    fail('no knowledge statement. Add a line to the PR body: "knowledge: updated <paths>" or "knowledge: none — <reason>"');
  } else if (parsed.kind === 'invalid') {
    fail(`unreadable knowledge statement: ${parsed.raw}`);
  } else if (parsed.kind === 'none' && parsed.reason.replace(/\s+/g, ' ').length < 20) {
    fail('knowledge: none needs a reason of at least 20 characters (what makes the change knowledge-neutral?)');
  }

  const base = opt('base', config.baseRef);
  const { misses } = runCheck(root, config, base, { strict: true, allowMiss: parsed?.kind === 'none' });

  const changed = changedFiles(root, base) ?? [];
  if (parsed?.kind === 'updated') {
    const touched = changed.filter((f) => f.startsWith(`${config.knowledgeDir}/`) || f === 'AGENTS.md');
    if (touched.length === 0) fail('the statement says "updated" but no knowledge file changed in this diff');
    for (const declared of parsed.paths) {
      if (!changed.includes(declared) && !changed.some((f) => f.startsWith(declared))) {
        fail(`the statement names ${declared}, which is not in this diff`);
      }
    }
  }
  if (parsed?.kind === 'none' && misses.length) {
    note(`knowledge: none accepted for: ${misses.join(', ')}`);
  }

  if (errors) {
    console.error(`\nknowledge gate FAILED — ${errors} error(s), ${warnings} warning(s).`);
    process.exit(1);
  }
  console.log(`\nknowledge gate passed — ${warnings} warning(s).`);
}

function impact() {
  const root = repoRoot();
  const config = loadConfig(root);
  const paths = argv.slice(1).filter((a) => !a.startsWith('--'));
  if (paths.length === 0) {
    console.error('usage: knowledge impact <path> [...]');
    process.exit(2);
  }
  for (const path of paths) {
    const posix = path.split(sep).join('/');
    const mods = config.modules.filter((mod) => matchesAny(posix, mod.paths ?? []));
    console.log(`\n${posix}`);
    if (mods.length === 0) { note('no module maps this path — add it to the map or record why not'); continue; }
    for (const mod of mods) {
      console.log(`  module   ${mod.id}`);
      for (const doc of mod.docs ?? []) console.log(`  docs     ${doc}${existsSync(join(root, doc)) ? '' : '  (MISSING)'}`);
      for (const test of mod.tests ?? []) console.log(`  tests    ${test}`);
    }
  }
}

function verify() {
  const root = repoRoot();
  const config = loadConfig(root);
  const target = argv[1];
  if (!target) { console.error('usage: knowledge verify <module-id|doc> [--sha <sha>]'); process.exit(2); }
  const sha = opt('sha', git(['rev-parse', 'HEAD']));
  const mods = config.modules.filter((m) => m.id === target);
  const docs = mods.length ? mods.flatMap((m) => m.docs ?? []) : [target];
  for (const doc of docs) {
    const path = join(root, doc);
    if (!existsSync(path)) { fail(`${doc} does not exist`); continue; }
    let text = readFileSync(path, 'utf8');
    if (!/^---\r?\n/.test(text)) { fail(`${doc} has no frontmatter block`); continue; }
    const date = new Date().toISOString().slice(0, 10);
    text = /^verified:.*$/m.test(text)
      ? text.replace(/^verified:.*$/m, `verified: ${sha}`)
      : text.replace(/^---\r?\n/, `---\nverified: ${sha}\n`);
    text = /^verified-at:.*$/m.test(text)
      ? text.replace(/^verified-at:.*$/m, `verified-at: ${date}`)
      : text.replace(/^verified:.*$/m, (line) => `${line}\nverified-at: ${date}`);
    writeFileSync(path, text);
    console.log(`verified ${doc} at ${sha.slice(0, 12)}`);
  }
  if (errors) process.exit(1);
}

function newTask() {
  const root = repoRoot();
  const config = loadConfig(root);
  const id = argv[1];
  if (!id || !opt('title')) { console.error('usage: knowledge new-task <ID> --title "<title>" [--dir <NNN-ID>]'); process.exit(2); }
  const dir = opt('dir', id);
  const target = join(root, config.tasksDir, dir, `${id}.md`);
  if (existsSync(target)) { fail(`${rel(root, target)} already exists`); process.exit(1); }
  mkdirSync(dirname(target), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const text = readFileSync(join(TEMPLATES, 'task.md'), 'utf8')
    .replaceAll('{{ID}}', id)
    .replaceAll('{{TITLE}}', opt('title'))
    .replaceAll('{{DATE}}', date);
  writeFileSync(target, text);
  console.log(`wrote ${rel(root, target)}`);
}

function status() {
  const root = repoRoot();
  const config = loadConfig(root);
  const knowledgeDir = join(root, config.knowledgeDir);
  const pages = markdownFiles(join(knowledgeDir, 'modules'));
  const pending = pages.filter((f) => frontmatter(readFileSync(f, 'utf8')).verified === 'pending');
  const tasks = markdownFiles(join(root, config.tasksDir));
  const since = config.taskKnowledgeSince;
  const missing = tasks.filter((f) => {
    const text = readFileSync(f, 'utf8');
    const updated = frontmatter(text).updated ?? '';
    return since && updated >= since && !/^knowledge\s*:/im.test(text) && !/^##\s+Knowledge\b/im.test(text);
  });
  console.log(`knowledge   ${config.knowledgeDir}`);
  console.log(`modules     ${pages.length} page(s), ${pending.length} pending verification`);
  console.log(`mapped      ${config.modules.length} module(s) across ${config.modules.reduce((n, m) => n + (m.paths?.length ?? 0), 0)} path pattern(s)`);
  console.log(`tasks       ${tasks.length} record(s), ${missing.length} without knowledge since ${since ?? '(no cutoff)'}`);
  for (const f of pending) console.log(`  pending   ${rel(root, f)}`);
  for (const f of missing.slice(0, 10)) console.log(`  no-kn     ${rel(root, f)}`);
}

function index() {
  const root = repoRoot();
  const config = loadConfig(root);
  const indexDoc = join(root, config.knowledgeDir, 'index.md');
  if (!existsSync(indexDoc)) { console.error(`missing ${config.knowledgeDir}/index.md`); process.exit(1); }
  const rows = markdownFiles(join(root, config.knowledgeDir, 'modules')).map((file) => {
    const fm = frontmatter(readFileSync(file, 'utf8'));
    return `| ${fm.title ?? rel(root, file)} | [${rel(root, file)}](${relative(dirname(indexDoc), file)}) | ${fm.owner ?? '—'} | ${fm.verified ?? '—'} |`;
  });
  const block = ['| Page | Path | Owner | Verified |', '|---|---|---|---|', ...rows].join('\n');
  let text = readFileSync(indexDoc, 'utf8');
  const start = '<!-- knowledge:index:start -->';
  const end = '<!-- knowledge:index:end -->';
  if (!text.includes(start) || !text.includes(end)) {
    fail(`index.md needs ${start} and ${end} around the generated table`);
    process.exit(1);
  }
  text = text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${block}\n${end}`);
  writeFileSync(indexDoc, text);
  console.log(`indexed ${rows.length} module page(s)`);
}

function help() {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
}

try {
  if (command === 'init') init();
  else if (command === 'gate') gate();
  else if (command === 'impact') impact();
  else if (command === 'verify') verify();
  else if (command === 'new-task') newTask();
  else if (command === 'status') status();
  else if (command === 'index') index();
  else if (command === 'check') {
    const root = repoRoot();
    const config = loadConfig(root);
    const base = opt('base', config.baseRef);
    runCheck(root, config, base, { strict: has('strict') });
    if (errors) { console.error(`\nknowledge check FAILED — ${errors} error(s), ${warnings} warning(s).`); process.exit(1); }
    console.log(`\nknowledge check passed — ${warnings} warning(s).`);
  } else {
    help();
    process.exit(command ? 2 : 0);
  }
} catch (error) {
  console.error(`knowledge: ${String(error?.message ?? error).split('\n').slice(0, 6).join('\n')}`);
  process.exit(2);
}
