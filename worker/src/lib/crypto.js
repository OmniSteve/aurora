// Shared crypto primitives -- WebCrypto only, nothing Node-specific, so this
// runs identically in workerd, `wrangler dev`, and tests.

export function randomToken(bytes = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// Short, human-typeable OTP -- digits only, no ambiguous-character concerns
// since there's nothing alphabetic to confuse. Rejection sampling avoids
// modulo bias.
export function randomDigits(length = 6) {
  const max = 10 ** length;
  const rejectionCeiling = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let n;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= rejectionCeiling);
  return String(n % max).padStart(length, '0');
}

export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

// Keyed hash for values that need durable correlation (rate-limit
// identifiers, IP addresses in sessions) without being reversible to the
// raw value from the stored hash alone. Not a session-signing key -- see
// worker/migrations/0013_auth_hardening.sql for why this exists.
export async function hmacSha256Hex(key, input) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(input));
  return toHex(new Uint8Array(sig));
}

export function constantTimeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
