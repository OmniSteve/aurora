import { describe, it, expect, vi, beforeEach } from 'vitest';
import { call, env, cleanupUser } from './helpers.js';
import * as emailLib from '../src/lib/email.js';

// Spies on the outbound send only -- everything upstream (code generation,
// hashing, storage, attempt limits) runs for real against the test D1
// instance. The 6-digit code is recovered from the rendered email body
// (never logged anywhere) purely so the test can submit it back.
function captureOtpEmails() {
  const sent = [];
  vi.spyOn(emailLib, 'sendEmail').mockImplementation(async (_env, { to, html }) => {
    const match = html.match(/(\d{6})/);
    sent.push({ to, code: match ? match[1] : null });
    return { sent: true };
  });
  return sent;
}

describe('registration + OTP verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('valid registration creates an unverified user and sends an OTP, no session yet', async () => {
    const email = 'otp-valid@example.com';
    await cleanupUser(email);
    const sent = captureOtpEmails();

    const { status, json } = await call('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'correct horse battery staple' },
    });

    expect(status).toBe(202);
    expect(json.status).toBe('verification_required');
    expect(sent).toHaveLength(1);
    expect(sent[0].code).toMatch(/^\d{6}$/);

    const user = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first();
    expect(user.email_verified).toBe(0);
    expect(user.password_hash.startsWith('pbkdf2-sha256$')).toBe(true);

    const meAttempt = await call('/api/auth/login', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    expect(meAttempt.status).toBe(403);
    expect(meAttempt.json.error).toBe('email_not_verified');

    await cleanupUser(email);
  });

  it('duplicate registration of a VERIFIED account is rejected (409, reveals existence deliberately)', async () => {
    const email = 'otp-dup-verified@example.com';
    await cleanupUser(email);
    captureOtpEmails();

    await call('/api/auth/register', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    await env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE email = ?`).bind(email).run();

    const { status, json } = await call('/api/auth/register', { method: 'POST', body: { email, password: 'another password entirely' } });
    expect(status).toBe(409);
    expect(json.error).toBe('email_taken');

    await cleanupUser(email);
  });

  it('re-registering an UNVERIFIED account overwrites the pending registration instead of creating a duplicate', async () => {
    const email = 'otp-dup-unverified@example.com';
    await cleanupUser(email);
    const sent = captureOtpEmails();

    await call('/api/auth/register', { method: 'POST', body: { email, password: 'first password 123' } });
    const firstUser = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();

    await call('/api/auth/register', { method: 'POST', body: { email, password: 'second password 456' } });
    const secondUser = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
    const rowCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE email = ?`).bind(email).first();

    expect(secondUser.id).toBe(firstUser.id); // same row, not a duplicate
    expect(rowCount.n).toBe(1);
    expect(sent).toHaveLength(2); // fresh OTP issued on the retry

    await cleanupUser(email);
  });

  it('OTP success verifies the account and establishes a session', async () => {
    const email = 'otp-success@example.com';
    await cleanupUser(email);
    const sent = captureOtpEmails();
    await call('/api/auth/register', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    const code = sent[0].code;

    const { status, json, cookies } = await call('/api/auth/verify-email', { method: 'POST', body: { email, code } });
    expect(status).toBe(200);
    expect(json.user.email_verified).toBe(true);
    expect(cookies.some((c) => c.startsWith('aurora_session='))).toBe(true);

    const user = await env.DB.prepare(`SELECT email_verified FROM users WHERE email = ?`).bind(email).first();
    expect(user.email_verified).toBe(1);

    await cleanupUser(email);
  });

  it('wrong OTP attempts are counted and eventually exhaust the code', async () => {
    const email = 'otp-wrong-attempts@example.com';
    await cleanupUser(email);
    captureOtpEmails();
    await call('/api/auth/register', { method: 'POST', body: { email, password: 'correct horse battery staple' } });

    for (let i = 0; i < 5; i++) {
      const { status, json } = await call('/api/auth/verify-email', { method: 'POST', body: { email, code: '000000' } });
      expect(status).toBe(400);
      expect(json.error).toBe('validation_error');
    }

    const token = await env.DB.prepare(`SELECT attempts, consumed_at FROM auth_tokens WHERE email = ? AND type = 'email_verify_otp'`).bind(email).first();
    expect(token.attempts).toBeGreaterThanOrEqual(5);
    expect(token.consumed_at).not.toBeNull(); // locked out after exhausting attempts

    await cleanupUser(email);
  });

  it('OTP cannot be reused after successful verification', async () => {
    const email = 'otp-reuse@example.com';
    await cleanupUser(email);
    const sent = captureOtpEmails();
    await call('/api/auth/register', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    const code = sent[0].code;

    const first = await call('/api/auth/verify-email', { method: 'POST', body: { email, code } });
    expect(first.status).toBe(200);

    const second = await call('/api/auth/verify-email', { method: 'POST', body: { email, code } });
    expect(second.status).toBe(400);
    expect(second.json.error).toBe('validation_error');

    await cleanupUser(email);
  });

  it('OTP expiry is enforced', async () => {
    const email = 'otp-expiry@example.com';
    await cleanupUser(email);
    const sent = captureOtpEmails();
    await call('/api/auth/register', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    const code = sent[0].code;

    // Force the stored token into the past rather than waiting 10 real minutes.
    await env.DB.prepare(`UPDATE auth_tokens SET expires_at = ? WHERE email = ? AND type = 'email_verify_otp'`)
      .bind(new Date(Date.now() - 1000).toISOString(), email)
      .run();

    const { status, json } = await call('/api/auth/verify-email', { method: 'POST', body: { email, code } });
    expect(status).toBe(400);
    expect(json.error).toBe('validation_error');

    await cleanupUser(email);
  });

  it('resend invalidates the previous OTP', async () => {
    const email = 'otp-resend@example.com';
    await cleanupUser(email);
    const sent = captureOtpEmails();
    await call('/api/auth/register', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    const firstCode = sent[0].code;

    await call('/api/auth/resend-verification', { method: 'POST', body: { email } });
    expect(sent).toHaveLength(2);

    const staleAttempt = await call('/api/auth/verify-email', { method: 'POST', body: { email, code: firstCode } });
    expect(staleAttempt.status).toBe(400);

    const freshAttempt = await call('/api/auth/verify-email', { method: 'POST', body: { email, code: sent[1].code } });
    expect(freshAttempt.status).toBe(200);

    await cleanupUser(email);
  });

  it('resend on an already-verified account does not send a new OTP', async () => {
    const email = 'otp-resend-verified@example.com';
    await cleanupUser(email);
    const sent = captureOtpEmails();
    await call('/api/auth/register', { method: 'POST', body: { email, password: 'correct horse battery staple' } });
    await call('/api/auth/verify-email', { method: 'POST', body: { email, code: sent[0].code } });

    const { json } = await call('/api/auth/resend-verification', { method: 'POST', body: { email } });
    expect(json.status).toBe('already_verified');
    expect(sent).toHaveLength(1); // no second send

    await cleanupUser(email);
  });
});
