/**
 * GitHub — the wall board, when `gh` is there.
 *
 * Optional by design: a clone without `gh`, or without an authenticated account, must still open an office.
 * `[]` from `gh issue list` is a REAL answer (this repo has no issues) and must not be shown as a failure —
 * the board simply has no cards. Only a failed command or an unauthorised one hides the board.
 *
 * The labels are the repository's own vocabulary (`scripts/issue-flow.mjs`): `lane:<name>`, `status:*`,
 * `gate:*`, `blocked`, `P0`…`P3`. A label outside that table becomes the `unknown` lane; nothing is dropped.
 */
import { firstLine, parseJson, run } from './exec.mjs';
import { redact } from '../redact.mjs';

/** The status progression a card moves through (the board's columns). `unknown` is last: shown, never dropped. */
export const COLUMNS = ['triage', 'spec', 'build', 'verify', 'review', 'merge', 'unknown'];

const STATUS_LANE = new Map([
  ['status:ready-to-merge', 'merge'],
  ['status:merged', 'merge'],
  ['status:in-review', 'review'],
  ['status:review', 'review'],
  ['status:verifying', 'verify'],
  ['status:building', 'build'],
  ['status:specced', 'spec'],
  ['status:triage', 'triage'],
]);

/** The labels of a `gh --json labels` row, whatever shape gh used (string[] in older builds). */
export function labelNames(labels) {
  if (!Array.isArray(labels)) return [];
  return labels.flatMap((l) => {
    if (typeof l === 'string') return [l];
    if (l !== null && typeof l === 'object' && typeof (/** @type {any} */ (l).name) === 'string') return [/** @type {any} */ (l).name];
    return [];
  });
}

/**
 * The lane OWNER a card names (`lane:dev`, `lane:qa`, `lane:sa` …) — who owns it, not where it is.
 * `lane:tbd` and no label are both "unassigned" (null): the board shows the card with a dash, it does not
 * invent an owner.
 * @param {string[]} labels
 */
export function ownerLane(labels) {
  const label = labels.find((l) => l.startsWith('lane:'));
  if (label === undefined) return null;
  const name = label.slice('lane:'.length).trim();
  return name === '' || name === 'tbd' ? null : name;
}

/**
 * A card's COLUMN from its labels: a `status:*` label wins; otherwise its state (`closed` → `merge`,
 * an open card → `triage`). The lane label says who owns a card, never where it sits.
 * @param {string[]} labels
 * @param {string} state
 */
export function columnOf(labels, state) {
  for (const label of labels) {
    const mapped = STATUS_LANE.get(label);
    if (mapped !== undefined) return mapped;
  }
  return state === 'closed' || state === 'merged' ? 'merge' : 'triage';
}

/** The priority label, or null — never a default priority the issue did not state. */
export function priorityOf(labels) {
  return labels.find((l) => /^P[0-3]$/u.test(l)) ?? null;
}

/** One `gh issue list` row → an issue card. */
export function mapIssue(row) {
  if (row === null || typeof row !== 'object') return null;
  const number = typeof row.number === 'number' ? row.number : null;
  const title = typeof row.title === 'string' ? row.title : null;
  if (number === null || title === null) return null;
  const labels = labelNames(row.labels);
  const state = typeof row.state === 'string' ? row.state.toLowerCase() : 'open';
  return {
    number,
    title: redact(title),
    lane: ownerLane(labels) === null ? null : redact(ownerLane(labels)),
    column: columnOf(labels, state),
    priority: priorityOf(labels),
    state: labels.includes('blocked') ? 'blocked' : state,
    url: typeof row.url === 'string' ? row.url : null,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
  };
}

/** One `gh pr list` row → a PR card. */
export function mapPull(row) {
  if (row === null || typeof row !== 'object') return null;
  const number = typeof row.number === 'number' ? row.number : null;
  const title = typeof row.title === 'string' ? row.title : null;
  if (number === null || title === null) return null;
  const labels = labelNames(row.labels);
  const state = typeof row.state === 'string' ? row.state.toLowerCase() : 'open';
  const releaseBranch = typeof row.headRefName === 'string' && /^release\//u.test(row.headRefName);
  return {
    number,
    title: redact(title),
    // A pull request carries no owner lane label; its branch head is what names the lane for a human.
    lane: null,
    column: releaseBranch ? 'merge' : columnOf(labels, state) === 'triage' ? 'review' : columnOf(labels, state),
    priority: priorityOf(labels),
    state: row.isDraft === true ? 'draft' : state,
    draft: row.isDraft === true,
    url: typeof row.url === 'string' ? row.url : null,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
  };
}

const ISSUE_FIELDS = 'number,title,state,labels,url,updatedAt';
const PR_FIELDS = 'number,title,state,isDraft,headRefName,labels,url,updatedAt';

/**
 * Read the board.
 * @param {{ command?: string, repo?: string | null, cwd: string, timeoutMs?: number, limit?: number }} options
 */
export async function readBoard({ command = 'gh', repo = null, cwd, timeoutMs, limit = 50 }) {
  const repoArgs = typeof repo === 'string' && repo.trim() !== '' ? ['--repo', repo.trim()] : [];
  const [issues, pulls] = await Promise.all([
    run(command, ['issue', 'list', ...repoArgs, '--limit', String(limit), '--json', ISSUE_FIELDS], { cwd, timeoutMs }),
    run(command, ['pr', 'list', ...repoArgs, '--limit', String(limit), '--json', PR_FIELDS], { cwd, timeoutMs }),
  ]);
  const fail = (res, what) => {
    if (res.ok) return null;
    const reason = firstLine(res.stderr) || `${what} failed`;
    // The unauthenticated sentence names the command to run; keep it short and redacted.
    return redact(reason);
  };
  const issueError = fail(issues, 'gh issue list');
  const prError = fail(pulls, 'gh pr list');
  if (issueError !== null || prError !== null) {
    return { ok: false, error: issueError ?? prError, issues: [], pulls: [] };
  }
  const parsedIssues = parseJson(issues.stdout);
  const parsedPulls = parseJson(pulls.stdout);
  if (!parsedIssues.ok || !parsedPulls.ok) {
    return { ok: false, error: redact(`gh: ${!parsedIssues.ok ? parsedIssues.error : !parsedPulls.ok ? parsedPulls.error : 'unreadable output'}`), issues: [], pulls: [] };
  }
  const issueRows = Array.isArray(parsedIssues.value) ? parsedIssues.value : [];
  const pullRows = Array.isArray(parsedPulls.value) ? parsedPulls.value : [];
  return {
    ok: true,
    error: null,
    issues: issueRows.map(mapIssue).filter((x) => x !== null),
    pulls: pullRows.map(mapPull).filter((x) => x !== null),
  };
}