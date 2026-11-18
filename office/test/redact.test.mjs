import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REDACTED, redact, redactDeep, redactLine } from '../lib/redact.mjs';

const cases = [
  ['a GitHub classic token', 'deploy with ghp_aBcD1234567890aBcD1234567890aBcD12 please'],
  ['a GitHub fine-grained token', 'x github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789ABCDEF'],
  ['an OpenAI-style key', 'sk-proj-AbCdEfGh12345678901234567890'],
  ['an AWS access key id', 'AKIAIOSFODNN7EXAMPLE'],
  ['a Slack token', 'xoxb-1234567890-abcdefghijkl'],
  ['a Google API key', 'AIzaSyA1234567890abcdefghijklmnopqrstu'],
  ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
  ['a bearer header', 'Authorization: Bearer abcdef1234567890abcdef'],
  ['a token in a URL', 'https://x.test/cb?access_token=abc123def456&state=ok'],
  ['a secret in a key=value pair', 'OPENAI_API_KEY=abcdef1234567890'],
  ['an e-mail address', 'owner <someone.private@example.com> wrote'],
];

for (const [what, input] of cases) {
  test(`redacts ${what}`, () => {
    const out = redact(input);
    assert.ok(out.includes(REDACTED), `expected ${REDACTED} in ${out}`);
    assert.ok(!out.includes('ghp_aBcD'), 'no token fragment survives');
    assert.ok(!out.includes('someone.private'), 'no e-mail survives');
    assert.ok(!out.includes('abcdef1234567890'), 'no key survives');
    assert.ok(!out.includes('abc123def456'), 'no query token survives');
  });
}

test('leaves ordinary prose alone', () => {
  const input = 'Office: the wall board hides the office (PR #208)';
  assert.equal(redact(input), input);
});

test('redacts nested strings and keeps the shape', () => {
  const input = { title: 'key sk-proj-AbCdEfGh12345678901234567890', n: 3, ok: true, nested: ['a@b.co'] };
  const out = redactDeep(input);
  assert.equal(out.n, 3);
  assert.equal(out.ok, true);
  assert.ok(!JSON.stringify(out).includes('sk-proj'));
  assert.ok(!JSON.stringify(out).includes('a@b.co'));
});

test('redactLine is one capped line', () => {
  const line = redactLine(`line one\nline two ${'x'.repeat(400)}`, 60);
  assert.ok(line.length <= 60);
  assert.ok(!line.includes('\n'));
});