/**
 * Orca — terminals, and (only when a Run is named) its orchestration tasks.
 *
 * ## What is read, and what is deliberately dropped
 *
 * `orca --json terminal list` answers a row per live terminal that includes a `preview`: a slice of RAW
 * TERMINAL OUTPUT. That string can hold a prompt, a token, a customer's data or an agent's whole
 * conversation. **No field of it is ever copied.** The mapper below names every field it keeps and starts
 * from an empty object, so a field Orca adds tomorrow cannot leak by default.
 *
 * Measured on Orca 1.4.198 (2026-11-17):
 *  - `--json` must come BEFORE the group/subcommand: `orca --json terminal list` parses,
 *    `orca terminal list --json` answers "Unknown command".
 *  - `orchestration task-list` needs a BOUND Run (`run_required`) and binding mutates orchestration state,
 *    which this view must never do. Tasks are therefore read only when the caller names a Run
 *    (`--run <id>`, read-only), and the absence is reported as a banner, not an error to retry.
 *  - `orchestration run-list`, `worker-list` and `worktree list|ps` are listed by `--help` on this build but
 *    answer `invalid_argument`; they are not used.
 */
import { firstLine, parseJson, run } from './exec.mjs';
import { redact } from '../redact.mjs';

/** A terminal title is `"OC | DeepSeek 1"`, `"LEAD | xqa"`, `"OC | Kimi 2"` … The prefix names the provider. */
const TITLE_PROVIDER = /^(?:OC|AG|CODE|CODEX|CLAUDE)\s*\|\s*([A-Za-z0-9. _+-]{2,24}?)\s*\d*$/u;

/**
 * One terminal → the fields the office may know.
 * @param {Record<string, unknown>} row
 */
export function mapTerminal(row) {
  if (row === null || typeof row !== 'object') return null;
  const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const handle = str(row.handle);
  const title = str(row.title);
  if (handle === null || title === null) return null;
  const branchRaw = str(row.branch);
  const titleMatch = TITLE_PROVIDER.exec(title);
  return {
    id: handle,
    title: redact(title),
    // `refs/heads/feat/x` → `feat/x`; a detached HEAD stays null rather than a guess.
    branch: branchRaw === null ? null : redact(branchRaw.replace(/^refs\/heads\//u, '')),
    worktree: str(row.worktreePath) === null ? null : redact(str(row.worktreePath)),
    provider: titleMatch === null ? null : redact(titleMatch[1].trim()),
    connected: row.connected === true,
    orphaned: row.orphaned === true,
    lastOutputAt: num(row.lastOutputAt),
    // Preview, ptyId, incarnationId, tabId, leafId, worktreeId: NOT copied. See the header.
  };
}

/**
 * The task list for a named Run. Read-only; never binds.
 * @param {{ command?: string, runId: string, timeoutMs?: number }} options
 */
export async function readTasks({ command = 'orca', runId, timeoutMs }) {
  if (typeof runId !== 'string' || runId.trim() === '') {
    return { ok: false, error: 'no orchestration run selected', tasks: [] };
  }
  const res = await run(command, ['--json', 'orchestration', 'task-list', '--run', runId.trim()], { timeoutMs });
  if (!res.ok) return { ok: false, error: firstLine(res.stderr) || (res.timedOut ? 'orca timed out' : 'orca failed'), tasks: [] };
  const parsed = parseJson(res.stdout);
  if (!parsed.ok) return { ok: false, error: `orca task list: ${parsed.error}`, tasks: [] };
  const body = /** @type {any} */ (parsed.value);
  const root = body?.result ?? body;
  const rows = Array.isArray(root?.tasks) ? root.tasks : Array.isArray(root?.items) ? root.items : [];
  const tasks = rows.flatMap((t) => {
    if (t === null || typeof t !== 'object') return [];
    const id = typeof t.id === 'string' ? t.id : null;
    const title = typeof t.title === 'string' ? t.title : typeof t.name === 'string' ? t.name : null;
    if (id === null || title === null) return [];
    return [{
      id,
      title: redact(title),
      status: typeof t.status === 'string' ? redact(t.status) : null,
      assignee: typeof t.assignee === 'string' ? redact(t.assignee) : typeof t.terminal === 'string' ? redact(t.terminal) : null,
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : null,
    }];
  });
  return { ok: true, error: null, tasks };
}

/**
 * The terminal list, as the office reads it.
 * @param {{ command?: string, limit?: number, timeoutMs?: number }} [options]
 */
export async function readTerminals({ command = 'orca', limit = 200, timeoutMs } = {}) {
  const res = await run(command, ['--json', 'terminal', 'list', '--limit', String(limit)], { timeoutMs });
  if (!res.ok) {
    const reason = res.timedOut ? 'orca timed out' : firstLine(res.stderr) || 'orca is not available';
    return { ok: false, error: redact(reason), terminals: [] };
  }
  const parsed = parseJson(res.stdout);
  if (!parsed.ok) return { ok: false, error: `orca: ${parsed.error}`, terminals: [] };
  const body = /** @type {any} */ (parsed.value);
  if (body?.ok === false) {
    const message = body?.error?.message;
    return { ok: false, error: redact(firstLine(typeof message === 'string' ? message : 'orca refused the request')), terminals: [] };
  }
  const root = body?.result ?? body;
  const rows = Array.isArray(root?.terminals) ? root.terminals : [];
  const terminals = rows.map(mapTerminal).filter((t) => t !== null);
  return { ok: true, error: null, terminals };
}