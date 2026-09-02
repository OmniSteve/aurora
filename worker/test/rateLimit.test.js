import { describe, it, expect } from 'vitest';
import { call, env, cleanupUser } from './helpers.js';

// These use a single fixed `ip` per test (unlike every other test file,
// which deliberately randomizes it) specifically to simulate repeated
// requests from the same client hitting the durable D1 layer -- see
// worker/src/lib/rateLimit.js. The Workers RateLimit binding (RL_AUTH,
// limit 10/10s) stays out of the way at this call volume across a whole
// test; what's actually being proven here is the D1-durable, per-identity
// limiter (login: 8/900s, forgot-password: 5/900s, newsletter: 20/3600s).
describe('rate limiting', () => {
  it('abusive login attempts eventually 429', async () => {
    const email = 'ratelimit-login@example.com';
    await cleanupUser(email);
    const ip = 'ratelimit-login-ip';

    const results = [];
    for (let i = 0; i < 9; i++) {
      const { status } = await call('/api/auth/login', { method: 'POST', body: { email, password: 'wrong' }, ip });
      results.push(status);
    }

    expect(results.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(results[8]).toBe(429);

    await cleanupUser(email);
  });

  it('forgot-password abuse is throttled', async () => {
    const email = 'ratelimit-forgot@example.com';
    const ip = 'ratelimit-forgot-ip';

    const results = [];
    for (let i = 0; i < 6; i++) {
      const { status } = await call('/api/auth/forgot-password', { method: 'POST', body: { email }, ip });
      results.push(status);
    }

    expect(results.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(results[5]).toBe(429);
  });

  it('newsletter subscribe abuse is throttled by IP', async () => {
    const ip = 'ratelimit-newsletter-ip';
    const results = [];
    for (let i = 0; i < 21; i++) {
      const { status } = await call('/api/newsletter/subscribe', {
        method: 'POST',
        body: { email: `ratelimit-news-${i}@example.com` },
        ip,
      });
      results.push(status);
    }

    expect(results.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(results[20]).toBe(429);

    await env.DB.prepare(`DELETE FROM newsletter_subscribers WHERE email LIKE 'ratelimit-news-%'`).run();
  });

  it('a rejected request carries a Retry-After header', async () => {
    const ip = 'ratelimit-retry-after-ip';
    for (let i = 0; i < 5; i++) {
      await call('/api/auth/forgot-password', { method: 'POST', body: { email: 'retry-after@example.com' }, ip });
    }
    const { response, status } = await call('/api/auth/forgot-password', { method: 'POST', body: { email: 'retry-after@example.com' }, ip });
    expect(status).toBe(429);
    expect(response.headers.get('retry-after')).toBeTruthy();
  });

  it('a client recovers once the window has passed', async () => {
    const ip = 'ratelimit-recovery-ip';
    const email = 'ratelimit-recovery@example.com';
    for (let i = 0; i < 5; i++) {
      await call('/api/auth/forgot-password', { method: 'POST', body: { email }, ip });
    }
    const blocked = await call('/api/auth/forgot-password', { method: 'POST', body: { email }, ip });
    expect(blocked.status).toBe(429);

    // Simulate the window having elapsed rather than waiting 900 real
    // seconds -- push every counter row for this identifier into the past.
    await env.DB.prepare(`UPDATE rate_limit_counters SET expires_at = ?, window_start = ? WHERE expires_at > ?`)
      .bind(new Date(Date.now() - 1000).toISOString(), new Date(Date.now() - 2000).toISOString(), new Date(Date.now() - 999999).toISOString())
      .run();

    const recovered = await call('/api/auth/forgot-password', { method: 'POST', body: { email }, ip });
    expect(recovered.status).toBe(200);
  });
});
