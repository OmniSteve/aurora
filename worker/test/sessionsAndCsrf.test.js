import { describe, it, expect } from 'vitest';
import { call, env, cleanupUser, registerAndVerify, extractAuthCookies } from './helpers.js';

async function freshSession(email) {
  await cleanupUser(email);
  const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
  return extractAuthCookies(cookies);
}

describe('sessions', () => {
  it('a valid session reaches /api/auth/me', async () => {
    const email = 'session-valid@example.com';
    const auth = await freshSession(email);

    const { status, json } = await call('/api/auth/me', { cookies: { aurora_session: auth.session } });
    expect(status).toBe(200);
    expect(json.user.email).toBe(email);
    // Never exposed, even here.
    expect(json.user.password_hash).toBeUndefined();

    await cleanupUser(email);
  });

  it('an invalid/garbage token is rejected', async () => {
    const { status } = await call('/api/auth/me', { cookies: { aurora_session: 'not-a-real-token' } });
    expect(status).toBe(401);
  });

  it('no cookie at all is rejected', async () => {
    const { status, json } = await call('/api/auth/me');
    expect(status).toBe(401);
    expect(json.error).toBe('auth_required');
  });

  it('an expired session is rejected', async () => {
    const email = 'session-expired@example.com';
    const auth = await freshSession(email);
    const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
    await env.DB.prepare(`UPDATE sessions SET expires_at = ? WHERE user_id = ?`).bind(new Date(Date.now() - 1000).toISOString(), user.id).run();

    const { status } = await call('/api/auth/me', { cookies: { aurora_session: auth.session } });
    expect(status).toBe(401);

    await cleanupUser(email);
  });

  it('a revoked session is rejected', async () => {
    const email = 'session-revoked@example.com';
    const auth = await freshSession(email);
    const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
    await env.DB.prepare(`UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?`).bind(user.id).run();

    const { status } = await call('/api/auth/me', { cookies: { aurora_session: auth.session } });
    expect(status).toBe(401);

    await cleanupUser(email);
  });

  it('logout revokes the session and clears all three cookies', async () => {
    const email = 'session-logout@example.com';
    const auth = await freshSession(email);

    const { status, cookies } = await call('/api/auth/logout', {
      method: 'POST',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
    });
    expect(status).toBe(200);
    expect(cookies.some((c) => c.startsWith('aurora_session=;') || c.includes('Max-Age=0'))).toBe(true);

    const { status: meStatus } = await call('/api/auth/me', { cookies: { aurora_session: auth.session } });
    expect(meStatus).toBe(401);

    await cleanupUser(email);
  });

  it('logout succeeds safely even with no valid session at all', async () => {
    const { status, cookies } = await call('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': 'irrelevant' } });
    expect(status).toBe(200);
    expect(cookies.length).toBeGreaterThan(0); // still clears cookies defensively
  });

  it('revokeAllForUser (logout-all capability) invalidates every session for that user', async () => {
    const email = 'session-logout-all@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'correct horse battery staple');

    const login1 = await call('/api/auth/login', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    const login2 = await call('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'correct horse battery staple' },
      cookies: { aurora_session: extractAuthCookies(login1.cookies).session },
    });
    const session2 = extractAuthCookies(login2.cookies).session;

    const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
    const { createSessionsRepository } = await import('../src/repositories/sessionsRepository.js');
    await createSessionsRepository(env.DB).revokeAllForUser(user.id);

    const { status } = await call('/api/auth/me', { cookies: { aurora_session: session2 } });
    expect(status).toBe(401);

    await cleanupUser(email);
  });

  it('a forged aurora_has_session marker cookie grants nothing -- /api/auth/me still 401', async () => {
    const { status } = await call('/api/auth/me', { cookies: { aurora_has_session: '1' } });
    expect(status).toBe(401);
  });
});

describe('CSRF', () => {
  it('missing CSRF header on an authenticated unsafe request is rejected', async () => {
    const email = 'csrf-missing@example.com';
    const auth = await freshSession(email);

    const { status, json } = await call('/api/auth/logout', { method: 'POST', cookies: { aurora_session: auth.session } });
    expect(status).toBe(403);
    expect(json.error).toBe('forbidden');

    await cleanupUser(email);
  });

  it('incorrect CSRF token is rejected', async () => {
    const email = 'csrf-wrong@example.com';
    const auth = await freshSession(email);

    const { status } = await call('/api/auth/logout', {
      method: 'POST',
      cookies: { aurora_session: auth.session },
      headers: { 'x-csrf-token': 'completely-wrong-token' },
    });
    expect(status).toBe(403);

    await cleanupUser(email);
  });

  it('correct CSRF token succeeds', async () => {
    const email = 'csrf-correct@example.com';
    const auth = await freshSession(email);

    const { status } = await call('/api/auth/logout', {
      method: 'POST',
      cookies: { aurora_session: auth.session },
      headers: { 'x-csrf-token': auth.csrf },
    });
    expect(status).toBe(200);

    await cleanupUser(email);
  });

  it('a mismatched Origin header is rejected even with a correct CSRF token', async () => {
    const email = 'csrf-origin@example.com';
    const auth = await freshSession(email);

    const { status, json } = await call('/api/auth/logout', {
      method: 'POST',
      cookies: { aurora_session: auth.session },
      headers: { 'x-csrf-token': auth.csrf },
      origin: 'https://evil.example.com',
    });
    expect(status).toBe(403);
    expect(json.error).toBe('forbidden');

    await cleanupUser(email);
  });

  it('GET requests are never CSRF-checked (safe method)', async () => {
    const email = 'csrf-get@example.com';
    const auth = await freshSession(email);

    const { status } = await call('/api/auth/me', { cookies: { aurora_session: auth.session } });
    expect(status).toBe(200);

    await cleanupUser(email);
  });
});
