import { describe, it, expect, vi } from 'vitest';
import { hashPassword, verifyPassword, PBKDF2_ITERATIONS } from '../src/lib/password.js';

describe('password hashing', () => {
  it('produces a self-describing pbkdf2-sha256 format', async () => {
    const hash = await hashPassword('correct horse battery staple');
    const parts = hash.split('$');
    expect(parts[0]).toBe('pbkdf2-sha256');
    expect(Number(parts[1])).toBe(PBKDF2_ITERATIONS);
    expect(parts[2].length).toBeGreaterThan(0);
    expect(parts[3].length).toBeGreaterThan(0);
  });

  it('uses a unique salt per call, even for the same password', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
  });

  it('verifies a correct password and rejects an incorrect one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('rejects a null/empty stored hash safely rather than throwing', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', undefined)).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });

  it('rejects a malformed stored hash safely', async () => {
    expect(await verifyPassword('anything', 'not-a-real-hash')).toBe(false);
    expect(await verifyPassword('anything', 'pbkdf2-sha256$notanumber$salt$hash')).toBe(false);
  });

  it('is tolerant of a different (e.g. lower, from an old record) iteration count stored in the hash itself', async () => {
    const cheapHash = await hashPasswordWithIterations('correct horse battery staple', 1000);
    expect(await verifyPassword('correct horse battery staple', cheapHash)).toBe(true);
  });

  // Benchmarks hashPassword() at whatever PBKDF2_ITERATIONS currently is.
  // Run via vitest-pool-workers' Miniflare simulation, which is close to
  // but not identical to the real edge runtime -- notably, Miniflare does
  // NOT enforce the production PBKDF2 iteration ceiling documented above
  // PBKDF2_ITERATIONS in worker/src/lib/password.js. That gap was only
  // caught by testing the actual deployed aurora-api-dev Worker (see the
  // Phase 4 checkpoint), which is why PBKDF2_ITERATIONS is 100,000 and not
  // the larger value this benchmark alone would have supported.
  it('benchmark: measures actual hashPassword() latency in this runtime', async () => {
    const timings = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await hashPassword('benchmark password value');
      timings.push(performance.now() - start);
    }
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(JSON.stringify({ scope: 'pbkdf2_benchmark', iterations: PBKDF2_ITERATIONS, runs: timings.map((t) => Math.round(t)), avgMs: Math.round(avg) }));
    // Sanity bound only -- the real numbers are read from the log above,
    // not asserted tightly, since CI/dev hardware varies.
    expect(avg).toBeLessThan(2000);
  });

  it('a stored hash the runtime refuses to derive (e.g. NotSupportedError) fails verification cleanly, not with a thrown error', async () => {
    // Simulates what the real production ceiling looks like from
    // verifyPassword's perspective, without actually running a
    // near-billion-iteration PBKDF2 call (Miniflare doesn't reject an
    // out-of-range count the way the real runtime does -- it would just
    // compute it, however long that takes).
    const hash = await hashPassword('correct horse battery staple');
    vi.spyOn(crypto.subtle, 'deriveBits').mockRejectedValueOnce(
      new DOMException('Pbkdf2 failed: iteration counts above 100000 are not supported', 'NotSupportedError'),
    );
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(false);
    vi.restoreAllMocks();
  });
});

// Test-only helper to construct a hash at an arbitrary iteration count,
// exercising the "self-describing format tolerates a different stored
// iteration count" guarantee without needing a second real code path.
async function hashPasswordWithIterations(password, iterations) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
  const toB64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `pbkdf2-sha256$${iterations}$${toB64Url(salt)}$${toB64Url(new Uint8Array(bits))}`;
}
