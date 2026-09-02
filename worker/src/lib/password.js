// PBKDF2-HMAC-SHA256 password hashing.
//
// Work factor: 100,000 iterations -- this is a hard ceiling, not a
// preference. OWASP's current Password Storage Cheat Sheet recommends
// 600,000 for PBKDF2-HMAC-SHA256, and 200,000 was the initial choice here
// after benchmarking workerd's WebCrypto PBKDF2 as meaningfully slower than
// a same-engine Node proxy suggested. Neither number is reachable in
// practice: Cloudflare's *production* Workers runtime enforces a hard
// `NotSupportedError` above 100,000 PBKDF2 iterations via WebCrypto. Local
// simulation (both `wrangler dev` and vitest-pool-workers' Miniflare) does
// NOT reproduce this limit -- 200,000 and even 600,000 iterations ran
// without error in every local benchmark (worker/test/password.test.js),
// and only failed once actually deployed to aurora-api-dev. That gap is
// exactly why the Phase 4 instructions called for benchmarking against the
// real runtime, not a simulation: local-only testing would have shipped a
// password hasher that 500s on every registration in production.
//
// Measured latency at the max allowed value, via vitest-pool-workers
// (Miniflare simulation -- workerd's real edge latency for PBKDF2 may
// differ somewhat, but this is the only number obtainable without hashing
// real user passwords in production to time it):
//   100,000 iterations -> ~128ms average (five runs)
//
// Stored format is self-describing so the iteration count travels with the
// hash and can be raised later without a schema change or a flag day --
// e.g. if Cloudflare raises the platform ceiling, or if a future migration
// moves to a different KDF entirely (Argon2/scrypt) that isn't
// WebCrypto-PBKDF2-limited:
//   pbkdf2-sha256$<iterations>$<base64url(salt)>$<base64url(derivedKey)>
// `password_algo` on the users table stays free for that KDF change.
import { toBase64Url, fromBase64Url } from './crypto.js';

export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

// Prevents pathologically large inputs (someone submitting a multi-MB
// string as a "password") from turning a cheap-looking request into an
// expensive one -- PBKDF2's cost scales with iterations, not input size,
// but importKey/deriveBits still has to process the whole input each round
// conceptually via the HMAC construction, so bounding input size is cheap
// insurance. 256 bytes is generous for any real passphrase.
const MAX_PASSWORD_BYTES = 256;

export function isPasswordLengthValid(password) {
  if (typeof password !== 'string' || password.length === 0) return false;
  return new TextEncoder().encode(password).length <= MAX_PASSWORD_BYTES;
}

export async function hashPassword(password) {
  if (!isPasswordLengthValid(password)) throw new Error('Password length out of bounds');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !isPasswordLengthValid(password)) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const salt = fromBase64Url(parts[2]);
  const expected = fromBase64Url(parts[3]);
  try {
    // The platform's PBKDF2 ceiling (100,000 iterations in production --
    // see the comment above PBKDF2_ITERATIONS) is enforced by the runtime
    // itself, not by a check here. A stored hash with an out-of-range
    // iteration count -- e.g. an old row from before this ceiling was
    // known, or plain corruption -- must fail verification cleanly rather
    // than throwing out of this function and turning into a 500.
    const actual = await deriveBits(password, salt, iterations);
    return constantTimeEqualBytes(actual, expected);
  } catch {
    return false;
  }
}

async function deriveBits(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, KEY_BITS);
  return new Uint8Array(bits);
}

function constantTimeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
