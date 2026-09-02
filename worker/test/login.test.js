import { describe, it, expect } from 'vitest';
import { call, cleanupUser, extractAuthCookies, registerAndVerify } from './helpers.js';

describe('login', () => {
  it('correct credentials succeed and set session cookies', async () => {
    const email = 'login-correct@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'correct horse battery staple');

    const { status, json, cookies } = await call('/api/auth/login', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    expect(status).toBe(200);
    expect(json.user.email).toBe(email);
    const auth = extractAuthCookies(cookies);
    expect(auth.session).toBeTruthy();
    expect(auth.csrf).toBeTruthy();
    expect(auth.hasSession).toBe('1');

    // The token itself is never in the JSON body.
    expect(JSON.stringify(json)).not.toContain(auth.session);

    await cleanupUser(email);
  });

  it('wrong password is rejected generically', async () => {
    const email = 'login-wrongpass@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'correct horse battery staple');

    const { status, json } = await call('/api/auth/login', { method: 'POST', body: { email, password: 'totally wrong password' } });
    expect(status).toBe(401);
    expect(json.error).toBe('invalid_credentials');

    await cleanupUser(email);
  });

  it('a non-existent account produces the exact same response as a wrong password', async () => {
    const email = 'login-correct2@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'correct horse battery staple');
    const wrongPassword = await call('/api/auth/login', { method: 'POST', body: { email, password: 'nope nope nope' } });

    const nonExistent = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'no-such-account@example.com', password: 'nope nope nope' },
    });

    expect(nonExistent.status).toBe(wrongPassword.status);
    expect(nonExistent.json.error).toBe(wrongPassword.json.error);
    expect(nonExistent.json.message).toBe(wrongPassword.json.message);

    await cleanupUser(email);
  });

  it('logging in again rotates the session -- the previous session is revoked', async () => {
    const email = 'login-rotate@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'correct horse battery staple');

    const first = await call('/api/auth/login', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    const firstAuth = extractAuthCookies(first.cookies);

    const second = await call('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'correct horse battery staple' },
      cookies: { aurora_session: firstAuth.session },
    });
    const secondAuth = extractAuthCookies(second.cookies);
    expect(secondAuth.session).not.toBe(firstAuth.session);

    const meWithFirst = await call('/api/auth/me', { cookies: { aurora_session: firstAuth.session } });
    expect(meWithFirst.status).toBe(401);

    const meWithSecond = await call('/api/auth/me', { cookies: { aurora_session: secondAuth.session } });
    expect(meWithSecond.status).toBe(200);

    await cleanupUser(email);
  });
});
