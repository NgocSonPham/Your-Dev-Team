/**
 * Git — where the work actually sits. No Orca needed, so the office is never empty on a clean clone.
 *
 * Reads the worktree table and, per worktree, whether its tree is dirty and HOW MANY files changed. It never
 * reads a diff, a commit body or a file: the count is all the office shows, and it keeps the poll cheap.
 */
import { firstLine, run } from './exec.mjs';
import { redact } from '../redact.mjs';

/**
 * Parse `git worktree list --porcelain` into rows.
 *
 * Blocks are separated by a blank line; the first line of a block is `worktree <path>`, and a block may carry
 * `HEAD <sha>`, `branch refs/heads/<name>` (absent when detached) and `bare`/`detached`.
 * @param {string} text
 * @returns {Array<{ path: string, head: string | null, branch: string | null, detached: boolean, bare: boolean }>}
 */
export function parseWorktreePorcelain(text) {
  const rows = [];
  let current = null;
  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.trimEnd();
    if (line === '') {
      if (current !== null) rows.push(current);
      current = null;
      continue;
    }
    if (line.startsWith('worktree ')) {
      if (current !== null) rows.push(current);
      current = { path: line.slice('worktree '.length), head: null, branch: null, detached: false, bare: false };
      continue;
    }
    if (current === null) continue;
    if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length);
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//u, '');
    else if (line === 'detached') current.detached = true;
    else if (line === 'bare') current.bare = true;
  }
  if (current !== null) rows.push(current);
  return rows;
}

/**
 * Read the repository's worktrees and each one's dirty state.
 * @param {{ cwd: string, command?: string, timeoutMs?: number }} options
 */
export async function readGit({ cwd, command = 'git', timeoutMs }) {
  const list = await run(command, ['worktree', 'list', '--porcelain'], { cwd, timeoutMs });
  if (!list.ok) {
    return { ok: false, error: redact(firstLine(list.stderr) || 'git is not available'), worktrees: [] };
  }
  const rows = parseWorktreePorcelain(list.stdout);
  // Status is asked of the worktrees that are readable; a worktree that was deleted out from under git is
  // reported as unknown (null) rather than clean — "clean" is a claim, "unknown" is the truth.
  const worktrees = await Promise.all(rows.map(async (row) => {
    if (row.bare) return { ...row, dirty: null, changed: null };
    const status = await run(command, ['-C', row.path, 'status', '--porcelain'], { cwd, timeoutMs });
    if (!status.ok) return { ...row, dirty: null, changed: null };
    const changed = status.stdout.split('\n').filter((l) => l.trim() !== '').length;
    return { ...row, dirty: changed > 0, changed };
  }));
  return {
    ok: true,
    error: null,
    worktrees: worktrees.map((w) => ({
      path: redact(w.path),
      branch: w.branch === null ? null : redact(w.branch),
      head: w.head,
      detached: w.detached,
      bare: w.bare,
      dirty: w.dirty,
      changed: w.changed,
    })),
  };
}