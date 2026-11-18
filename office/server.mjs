#!/usr/bin/env node
/**
 * Office — a local, realtime view of Your Dev Team.
 *
 *   npm run office                 live:  Orca terminals + git worktrees + the GitHub board
 *   npm run office -- --demo       a deterministic simulated office, no subprocess, no network
 *   npm run office -- --once       print the state as JSON and exit (for a smoke test)
 *
 * What this server is: a static file server for `office/public`, three read-only JSON routes and one SSE
 * stream. What it is NOT: a proxy. No terminal output, prompt, log, diff or file body is ever read from a
 * source or sent to a browser — the sources in `lib/sources/` map a fixed field list, and `lib/redact.mjs`
 * runs on the way in.
 *
 * No dependencies, no build. Node 18+.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLiveState, diffStates, poll } from './lib/state.mjs';
import { demoState, DEMO_SEED, TICK_MS } from './lib/demo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = join(HERE, 'public');
const REPO_ROOT = resolve(HERE, '..');

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json; charset=utf-8'],
  ['.woff2', 'font/woff2'],
  ['.png', 'image/png'],
]);

/** Security headers on every answer. No CORS header exists on purpose: the office is same-origin only. */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq > 0) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--') && !['demo', 'once', 'help'].includes(arg.slice(2))) {
      flags.set(arg.slice(2), next);
      i += 1;
    } else {
      flags.set(arg.slice(2), true);
    }
  }
  return {
    demo: flags.get('demo') === true,
    once: flags.get('once') === true,
    help: flags.get('help') === true,
    host: typeof flags.get('host') === 'string' ? flags.get('host') : '127.0.0.1',
    port: Number(flags.get('port') ?? 4317),
    intervalMs: Math.max(500, Number(flags.get('interval') ?? TICK_MS) || TICK_MS),
    seed: Number(flags.get('seed') ?? DEMO_SEED) >>> 0,
    runId: typeof flags.get('run') === 'string' ? flags.get('run') : null,
    repo: typeof flags.get('repo') === 'string' ? flags.get('repo') : null,
    root: typeof flags.get('root') === 'string' ? resolve(flags.get('root')) : REPO_ROOT,
  };
}

const HELP = `office — a local, realtime virtual office for Your Dev Team

  npm run office [-- options]

  --demo             deterministic simulated office (no Orca, no git, no gh)
  --seed <n>         demo seed (default ${String(DEMO_SEED)})
  --once             print /api/state as JSON and exit
  --port <n>         port (default 4317)
  --host <addr>      bind address (default 127.0.0.1; anything else is refused)
  --interval <ms>    poll interval, min 500 (default ${String(TICK_MS)})
  --run <id>         read Orca orchestration tasks for this Run (read-only; never binds)
  --repo <o/name>    the board repository for gh (default: the current checkout's remote)
  --root <path>      the repository to watch (default: this checkout)
  --help             this text

Local only. No telemetry, no external requests, no auth.`;

/** Is this Host header one of ours? Blocks a DNS-rebinding page from reading the API. */
function allowedHost(header, port) {
  if (typeof header !== 'string') return false;
  const name = header.replace(/:\d+$/u, '').toLowerCase();
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || name === '::1';
}

/** Is the request's Origin (when the browser sends one) our own page? */
function allowedOrigin(origin, port) {
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]') && url.port === String(port);
  } catch {
    return false;
  }
}

/** The one path rule: resolve inside `office/public`, refuse everything else. */
async function resolveStatic(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (relative.includes('..')) return null;
  const candidate = normalize(join(PUBLIC_ROOT, relative === '' ? 'index.html' : relative));
  if (candidate !== PUBLIC_ROOT && !candidate.startsWith(PUBLIC_ROOT + sep)) return null;
  try {
    const real = await realpath(candidate);
    const realRoot = await realpath(PUBLIC_ROOT);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) return null;
    const info = await stat(real);
    if (!info.isFile()) return null;
    return { path: real, size: info.size };
  } catch {
    return null;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function send404(res) {
  // 404, never 403: a 403 would confirm that a file exists behind the refusal.
  sendJson(res, 404, { error: 'Not found' });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (args.host !== '127.0.0.1' && args.host !== 'localhost' && args.host !== '::1') {
    process.stderr.write(`office: refusing to bind ${args.host}. This view is local-only (127.0.0.1).\n`);
    process.exitCode = 2;
    return;
  }

  /** The last state, and the memory the mappers need between polls. */
  let state = args.demo ? demoState(0, args.seed) : null;
  const previousSeats = new Map();
  const clients = new Set();
  let ticking = false;
  const startedAt = Date.now();

  const broadcast = (event, data) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(frame);
      } catch {
        clients.delete(res);
      }
    }
  };

  const publish = (next) => {
    const patches = diffStates(state, next);
    state = next;
    for (const patch of patches) broadcast('patch', patch);
  };

  const tickLive = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const answers = await poll({
        cwd: args.root,
        ...(args.runId === null ? {} : { runId: args.runId }),
        repo: args.repo,
        timeoutMs: Math.max(5_000, args.intervalMs * 6),
      });
      const next = buildLiveState({ ...answers, now: Date.now(), runId: args.runId, repo: args.repo, previousSeats, previous: state });
      publish(next);
    } catch (error) {
      // A poll must never kill the office: the last state stays, and the health route says which source failed.
      process.stderr.write(`office: poll failed: ${String(error?.message ?? error)}\n`);
    } finally {
      ticking = false;
    }
  };

  const tickDemo = () => {
    const tick = Math.floor((Date.now() - startedAt) / args.intervalMs);
    publish(demoState(tick, args.seed));
  };

  const tick = () => (args.demo ? tickDemo() : tickLive());

  if (args.once) {
    const finish = (value) => {
      process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    };
    if (args.demo) {
      finish(demoState(0, args.seed));
      return;
    }
    poll({ cwd: args.root, runId: args.runId, repo: args.repo })
      .then((answers) => finish(buildLiveState({ ...answers, now: Date.now(), runId: args.runId, repo: args.repo, previousSeats })))
      .catch((error) => {
        process.stderr.write(`office: ${String(error?.message ?? error)}\n`);
        process.exitCode = 1;
      });
    return;
  }

  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    if (!allowedHost(req.headers.host, args.port)) {
      send404(res);
      return;
    }
    const path = url.split('?')[0];

    if (path === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        mode: args.demo ? 'demo' : 'live',
        uptimeMs: Date.now() - startedAt,
        clients: clients.size,
        sources: state?.sources ?? null,
      });
      return;
    }

    if (path === '/api/state') {
      sendJson(res, 200, state ?? { updatedAt: new Date().toISOString(), mode: args.demo ? 'demo' : 'live', sources: {}, departments: [], people: [], board: { lanes: [], issues: [], prs: [] }, events: [] });
      return;
    }

    if (path === '/api/events') {
      if (!allowedOrigin(req.headers.origin, args.port)) {
        send404(res);
        return;
      }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 2000\n\n`);
      if (state !== null) res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
      clients.add(res);
      // A heartbeat the client can ignore; it keeps a proxy and a sleeping laptop from dropping the stream.
      const ping = setInterval(() => {
        try {
          res.write(`: ping ${new Date().toISOString()}\n\n`);
        } catch {
          /* the close handler removes it */
        }
      }, 15_000);
      const close = () => {
        clearInterval(ping);
        clients.delete(res);
      };
      req.on('close', close);
      req.on('error', close);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send404(res);
      return;
    }

    const file = await resolveStatic(url);
    if (file === null) {
      send404(res);
      return;
    }
    const type = CONTENT_TYPES.get(extname(file.path).toLowerCase()) ?? 'application/octet-stream';
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': file.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file.path).pipe(res);
  });

  server.on('error', (error) => {
    process.stderr.write(`office: ${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });

  // First state before the first client arrives; then one poll per interval.
  (async () => {
    if (args.demo) {
      state = demoState(0, args.seed);
    } else {
      await tickLive();
    }
    const timer = setInterval(tick, args.intervalMs);
    server.listen(args.port, args.host, () => {
      process.stdout.write(`office: ${args.demo ? 'demo' : 'live'} on http://${args.host}:${String(args.port)} — local only, no telemetry\n`);
    });
    const stop = () => {
      clearInterval(timer);
      for (const res of clients) {
        try {
          res.end();
        } catch {
          /* already gone */
        }
      }
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500).unref();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  })();
}

main();