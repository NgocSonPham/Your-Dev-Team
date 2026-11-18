import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, '..', 'server.mjs');

/** Ask the OS for a free port, so two lanes never collide. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

let child;
let base;

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${String(port)}`;
  child = spawn(process.execPath, [SERVER, '--demo', '--port', String(port), '--interval', '500'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('office did not start in 15 s')), 15_000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('office: demo on')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`office exited ${String(code)} before listening`)));
  });
});

after(() => {
  if (child !== undefined && child.exitCode === null) child.kill('SIGTERM');
});

test('GET /api/state answers the demo office', async () => {
  const res = await fetch(`${base}/api/state`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const state = await res.json();
  assert.equal(state.mode, 'demo');
  assert.ok(Array.isArray(state.people) && state.people.length > 0);
  assert.ok(!JSON.stringify(state).includes('preview'), 'state must not carry a terminal preview');
});

test('the page is served with the security headers, and no CORS header exists', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy') ?? '';
  assert.ok(csp.includes("default-src 'self'"), 'CSP is present');
  assert.ok(csp.includes("frame-ancestors 'none'"), 'the page cannot be framed');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  const html = await res.text();
  assert.ok(html.includes('Your Dev Team'));
  assert.ok(!/https?:\/\//.test(html), 'no external reference in the page');
});

test('nothing outside office/public is served', async () => {
  for (const path of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/.env', '/server.mjs', '/lib/state.mjs']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, `${path} must be 404`);
  }
});

test('a foreign Host header is refused (DNS rebinding)', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: new URL(base).port, path: '/api/state', headers: { host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 404);
});

test('the event stream opens with the full state, then patches', async () => {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: controller.signal, headers: { accept: 'text/event-stream' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + 10_000;
  while (!buffer.includes('event: state') && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  controller.abort();
  assert.ok(buffer.includes('event: state'), 'the first frame is the state');
  const dataLine = buffer.split('\n').find((line) => line.startsWith('data: '));
  assert.ok(dataLine !== undefined);
  const state = JSON.parse(dataLine.slice('data: '.length));
  assert.equal(state.mode, 'demo');
  assert.ok(!JSON.stringify(state).includes('preview'));
});