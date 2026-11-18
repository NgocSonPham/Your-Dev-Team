/**
 * Redaction — the one place untrusted text becomes displayable.
 *
 * The office shows titles, branch names, task names and error sentences that come from Orca, git and GitHub.
 * Any of them can carry a credential: a branch named after a ticket that quotes a token, an issue title a
 * person pasted a key into, an Orca error that echoes a header. Redaction therefore runs on the way IN — the
 * state the API serves and the HTML the browser renders can only ever hold the redacted string.
 *
 * Pure, no imports, no I/O: `redact(text)` and `redactDeep(value)`.
 */

/** A marker that cannot be mistaken for content. */
export const REDACTED = '[redacted]';

/**
 * Each rule is `[name, pattern, replacement]`, applied in order. Patterns are global.
 * Ordered so a specific shape (JWT) wins before a looser one (bearer) rewrites its prefix.
 */
const RULES = [
  // JSON Web Tokens: header.payload.signature, all base64url.
  ['jwt', /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, REDACTED],
  // GitHub tokens: classic PAT, OAuth, app, fine-grained, refresh, server-to-server.
  ['github', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, REDACTED],
  // Stripe-style and OpenAI-style secret keys, and the generic `sk-` family.
  ['api-key', /\b(?:sk|rk|pk)[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{16,}\b/g, REDACTED],
  ['sk', /\bsk-[A-Za-z0-9_-]{16,}\b/g, REDACTED],
  // AWS access key id and secret access key.
  ['aws-id', /\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  ['aws-secret', /\b(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*\S+/g, REDACTED],
  // Slack tokens.
  ['slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, REDACTED],
  // Google API keys.
  ['google', /\bAIza[A-Za-z0-9_-]{30,}\b/g, REDACTED],
  // An Authorization header value, quoted or not.
  ['bearer', /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}=*/gi, REDACTED],
  // A secret in a URL or query string: token=, key=, secret=, password=, sig=, signature=.
  ['url-secret', /([?&;](?:access_?token|refresh_?token|token|api_?key|key|secret|password|passwd|sig|signature|x-amz-[a-z-]+)=)[^&\s"'<>]+/gi, `$1${REDACTED}`],
  // `KEY=value` / `key: value` for the obvious secret names, outside a URL.
  ['kv-secret', /\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)[A-Za-z0-9_]*)\s*[=:]\s*["']?[^\s"',;}]{6,}/g, `$1=${REDACTED}`],
  // E-mail addresses: the office never needs one, and a team member's address is personal data.
  ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, REDACTED],
  // Long opaque runs that look like a credential and nothing like prose (>= 40 chars, no spaces).
  ['opaque', /\b(?=[A-Za-z0-9_\-./+=]*[0-9])(?=[A-Za-z0-9_\-./+=]*[A-Za-z])[A-Za-z0-9_\-./+=]{40,}\b/g, REDACTED],
];

/**
 * Redact `value` when it is a string; return anything else unchanged.
 * @param {unknown} value
 * @returns {unknown}
 */
export function redact(value) {
  if (typeof value !== 'string' || value === '') return value;
  let out = value;
  for (const [, pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}

/** Redact every string inside a JSON-shaped value, leaving keys and non-strings alone. */
export function redactDeep(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}

/** One line, capped — what a banner may show. */
export function redactLine(text, max = 200) {
  const redacted = String(redact(text) ?? '').replace(/\s+/g, ' ').trim();
  return redacted.length > max ? `${redacted.slice(0, max - 1)}…` : redacted;
}