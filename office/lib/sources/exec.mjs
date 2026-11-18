/**
 * One process call, bounded and never thrown through.
 *
 * Every source goes through here so the rules live in one place: no shell (argv only), a hard timeout, a
 * bounded buffer, stdin closed, and an answer object instead of an exception — a source that fails is a
 * banner, never a crash. The office must not be able to hang on a stuck CLI.
 */
import { execFile } from 'node:child_process';

export const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 8 * 1024 * 1024;

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {{ timeoutMs?: number, cwd?: string }} [options]
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, code: number | null, timedOut: boolean }>}
 */
export function run(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      {
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const err = /** @type {{ code?: number | string, killed?: boolean, signal?: string }} */ (error ?? {});
        resolve({
          ok: error === null || error === undefined,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          code: typeof err.code === 'number' ? err.code : null,
          timedOut: err.killed === true || err.signal === 'SIGTERM',
        });
      },
    );
  });
}

/**
 * Parse JSON, tolerating a CLI that printed a banner line before it.
 * @param {string} text
 * @returns {{ ok: true, value: unknown } | { ok: false, error: string }}
 */
export function parseJson(text) {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'empty output' };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    // Orca prints human guidance before JSON on some paths; take the last balanced object.
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return { ok: true, value: JSON.parse(trimmed.slice(first, last + 1)) };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: 'output was not JSON' };
  }
}

/** Short, redacted one-liner for a banner — never a wall of stderr. */
export function firstLine(text, max = 200) {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}