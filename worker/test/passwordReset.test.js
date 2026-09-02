import { describe, it, expect, vi } from 'vitest';
import { call, env, cleanupUser, registerAndVerify, extractAuthCookies } from './helpers.js';
import * as emailLib from '../src/lib/email.js';

async function requestReset(email) {
  const links = [];
  const spy = vi.spyOn(emailLib, 'sendEmail').mockImplementation(async (_env, { to, html }) => {
    const match = html.match(/token=([^"&]+)/);
    links.push({ to, token: match ? decodeURIComponent(match[1]) : null });
    return { sent: true };
  });
  await call('/api/auth/forgot-password', { method: 'POST', body: { email } });
  spy.mockRestore();
  return links[0]?.token;
}

describe('password reset', () => {
  it('forgot-password responds identically whether or not the account exists', async () => {
    const email = 'reset-generic@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'correct horse battery staple');

    vi.spyOn(emailLib, 'sendEmail').mockResolvedValue({ sent: true });
    const existing = await call('/api/auth/forgot-password', { method: 'POST', body: { email } });
    const nonExisting = await call('/api/auth/forgot-password', { method: 'POST', body: { email: 'nobody-here@example.com' } });
    vi.restoreAllMocks();

    expect(existing.status).toBe(nonExisting.status);
    expect(existing.json).toEqual(nonExisting.json);

    await cleanupUser(email);
  });

  it('a valid reset token changes the password and the new password works at login', async () => {
    const email = 'reset-success@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'old password 123');
    const token = await requestReset(email);
    expect(token).toBeTruthy();

    const { status } = await call('/api/auth/reset-password', { method: 'POST', body: { token, newPassword: 'brand new password 456' } });
    expect(status).toBe(200);

    const oldFails = await call('/api/auth/login', { method: 'POST', body: { email, password: 'old password 123' } });
    expect(oldFails.status).toBe(401);

    const newWorks = await call('/api/auth/login', { method: 'POST', body: { email, password: 'brand new password 456' } });
    expect(newWorks.status).toBe(200);

    await cleanupUser(email);
  });

  it('reset token cannot be reused', async () => {
    const email = 'reset-reuse@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'old password 123');
    const token = await requestReset(email);

    const first = await call('/api/auth/reset-password', { method: 'POST', body: { token, newPassword: 'first new password' } });
    expect(first.status).toBe(200);

    const second = await call('/api/auth/reset-password', { method: 'POST', body: { token, newPassword: 'second new password' } });
    expect(second.status).toBe(400);
    expect(second.json.error).toBe('validation_error');

    await cleanupUser(email);
  });

  it('expired reset token is rejected', async () => {
    const email = 'reset-expiry@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'old password 123');
    const token = await requestReset(email);

    await env.DB.prepare(`UPDATE auth_tokens SET expires_at = ? WHERE email = ? AND type = 'password_reset'`)
      .bind(new Date(Date.now() - 1000).toISOString(), email)
      .run();

    const { status, json } = await call('/api/auth/reset-password', { method: 'POST', body: { token, newPassword: 'irrelevant password' } });
    expect(status).toBe(400);
    expect(json.error).toBe('validation_error');

    await cleanupUser(email);
  });

  it('a successful reset revokes every existing session', async () => {
    const email = 'reset-revokes@example.com';
    await cleanupUser(email);
    await registerAndVerify(email, 'old password 123');

    const login1 = await call('/api/auth/login', { method: 'POST', body: { email, password: 'old password 123' } });
    const session1 = extractAuthCookies(login1.cookies).session;

    const token = await requestReset(email);
    await call('/api/auth/reset-password', { method: 'POST', body: { token, newPassword: 'post reset password' } });

    const meAfterReset = await call('/api/auth/me', { cookies: { aurora_session: session1 } });
    expect(meAfterReset.status).toBe(401);

    await cleanupUser(email);
  });
});
