import { randomToken, randomDigits, sha256Hex, hmacSha256Hex, constantTimeEqualHex } from '../lib/crypto.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { buildCookie, buildExpiredCookie, getCookie } from '../lib/cookies.js';
import { getClientIp } from '../lib/rateLimit.js';
import { logAuditEvent } from '../lib/audit.js';
import { sendEmail, otpEmail, passwordResetEmail } from '../lib/email.js';
import { toSafeProfile } from '../repositories/usersRepository.js';
import { HttpError, ValidationError } from '../lib/http.js';

const PASSWORD_ALGO = 'pbkdf2-sha256';
const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000; // short expiry -- typed immediately from an open inbox
const OTP_MAX_ATTEMPTS = 5;
const RESET_TTL_MS = 30 * 60 * 1000; // slightly longer -- reached via an emailed link, not typed
const SESSION_COOKIE = 'aurora_session';
const MARKER_COOKIE = 'aurora_has_session';
const CSRF_COOKIE = 'aurora_csrf';

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

// One place a session gets minted -- login, email verification, (deliberately
// NOT password reset, matching the documented API_CONTRACT flow: reset
// redirects to /login rather than auto-signing-in).
async function createSessionForUser(ctx, user) {
  const sessionId = crypto.randomUUID();
  const sessionToken = randomToken(32);
  const tokenHash = await sha256Hex(sessionToken);
  const csrfToken = randomToken(32);
  const csrfTokenHash = await sha256Hex(csrfToken);

  const ip = getClientIp(ctx.request);
  const ipHash = ctx.env.SECURITY_HASH_KEY ? await hmacSha256Hex(ctx.env.SECURITY_HASH_KEY, ip) : null;
  const userAgent = (ctx.request.headers.get('user-agent') || '').slice(0, 255) || null;

  const { expiresAt } = await ctx.repositories.sessions.create({
    id: sessionId,
    userId: user.id,
    tokenHash,
    csrfTokenHash,
    ipHash,
    userAgent,
    role: user.role,
  });

  const maxAgeSeconds = Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const cookies = [
    buildCookie(SESSION_COOKIE, sessionToken, { maxAgeSeconds, httpOnly: true }),
    buildCookie(MARKER_COOKIE, '1', { maxAgeSeconds, httpOnly: false }),
    buildCookie(CSRF_COOKIE, csrfToken, { maxAgeSeconds, httpOnly: false }),
  ];
  return { cookies, sessionId };
}

export function clearSessionCookies() {
  return [
    buildExpiredCookie(SESSION_COOKIE, { httpOnly: true }),
    buildExpiredCookie(MARKER_COOKIE, { httpOnly: false }),
    buildExpiredCookie(CSRF_COOKIE, { httpOnly: false }),
  ];
}

// --- Registration -----------------------------------------------------

export async function register(ctx, { email, password, fullName }) {
  const normalizedEmail = normalizeEmail(email);
  const users = ctx.repositories.users;
  const existing = await users.findByEmail(normalizedEmail);

  if (existing && existing.email_verified) {
    throw new HttpError(409, 'email_taken', 'An account with this email already exists.');
  }

  const passwordHash = await hashPassword(password);
  let userId;
  if (existing) {
    // Unverified account re-registering: overwrite the pending
    // registration (fresh password, fresh OTP) instead of creating a
    // second row. See repositories/usersRepository.js.
    await users.overwritePendingRegistration(existing.id, { passwordHash, passwordAlgo: PASSWORD_ALGO, fullName });
    userId = existing.id;
  } else {
    const created = await users.create({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      passwordHash,
      passwordAlgo: PASSWORD_ALGO,
      fullName,
      emailVerified: false,
      role: 'user',
    });
    userId = created.id;
  }

  await issueAndSendOtp(ctx, { userId, email: normalizedEmail });
  await logAuditEvent(ctx.env.DB, { actorUserId: userId, action: 'auth.register', entityType: 'user', entityId: userId });

  return { status: 'verification_required' };
}

async function issueAndSendOtp(ctx, { userId, email }) {
  const authTokens = ctx.repositories.authTokens;
  await authTokens.invalidateOutstanding(userId, 'email_verify_otp');

  const code = randomDigits(OTP_LENGTH);
  const tokenHash = await sha256Hex(code);
  await authTokens.create({
    id: crypto.randomUUID(),
    userId,
    email,
    type: 'email_verify_otp',
    tokenHash,
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });

  const { subject, html } = otpEmail(code);
  // Never log `code` -- only that a send was attempted/succeeded (lib/email.js).
  await sendEmail(ctx.env, { to: email, subject, html, requestId: ctx.requestId });
}

export async function resendVerification(ctx, { email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await ctx.repositories.users.findByEmail(normalizedEmail);

  if (user && user.email_verified) {
    return { status: 'already_verified' };
  }
  if (user) {
    await issueAndSendOtp(ctx, { userId: user.id, email: normalizedEmail });
  }
  // Same response whether or not an unverified account exists, so this
  // can't be used to enumerate accounts beyond what register() already
  // reveals for *verified* ones.
  return { status: 'sent' };
}

export async function verifyEmail(ctx, { email, code }) {
  const normalizedEmail = normalizeEmail(email);
  const authTokens = ctx.repositories.authTokens;
  const token = await authTokens.findValidByEmailAndType(normalizedEmail, 'email_verify_otp');

  const invalidCode = () => {
    throw new ValidationError('Invalid or expired code.');
  };

  if (!token || token.attempts >= OTP_MAX_ATTEMPTS) invalidCode();

  const providedHash = await sha256Hex(code);
  if (!constantTimeEqualHex(providedHash, token.token_hash)) {
    const attempts = await authTokens.incrementAttempts(token.id);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await authTokens.consume(token.id);
      await logAuditEvent(ctx.env.DB, {
        actorUserId: token.user_id,
        action: 'auth.otp_attempts_exhausted',
        entityType: 'auth_token',
        entityId: token.id,
      });
    }
    invalidCode();
  }

  await authTokens.consume(token.id);
  await ctx.repositories.users.setEmailVerified(token.user_id);
  await logAuditEvent(ctx.env.DB, { actorUserId: token.user_id, action: 'auth.email_verified', entityType: 'user', entityId: token.user_id });

  const user = await ctx.repositories.users.findById(token.user_id);
  const { cookies } = await createSessionForUser(ctx, user);
  return { user: toSafeProfile(user), cookies };
}

// --- Login --------------------------------------------------------------

export async function login(ctx, { email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await ctx.repositories.users.findByEmail(normalizedEmail);

  const invalidCredentials = () => {
    throw new HttpError(401, 'invalid_credentials', 'Invalid email or password.');
  };

  // Same generic failure whether the account doesn't exist, has no
  // password set (Google-only account), or the password is wrong --
  // verifyPassword(x, null-ish) safely returns false rather than throwing.
  const passwordOk = await verifyPassword(password, user?.password_hash);
  if (!user || !passwordOk) invalidCredentials();

  if (!user.email_verified) {
    // Distinct from invalidCredentials() -- the caller already proved they
    // know the password, so "not verified yet" leaks nothing beyond what
    // that proof already established.
    throw new HttpError(403, 'email_not_verified', 'Please verify your email before signing in.');
  }

  // Rotate any pre-existing session presented alongside this login --
  // never extend/reuse an old session row, always mint a fresh one.
  const existingToken = getCookie(ctx.request, SESSION_COOKIE);
  if (existingToken) {
    const existingHash = await sha256Hex(existingToken);
    const existingSession = await ctx.repositories.sessions.findActiveByTokenHash(existingHash);
    if (existingSession) await ctx.repositories.sessions.revoke(existingSession.id);
  }

  const { cookies } = await createSessionForUser(ctx, user);
  await logAuditEvent(ctx.env.DB, { actorUserId: user.id, action: 'auth.login_succeeded', entityType: 'user', entityId: user.id });

  return { user: toSafeProfile(user), cookies };
}

// --- Password reset -------------------------------------------------------

export async function forgotPassword(ctx, { email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await ctx.repositories.users.findByEmail(normalizedEmail);

  if (user) {
    const authTokens = ctx.repositories.authTokens;
    await authTokens.invalidateOutstanding(user.id, 'password_reset');

    const token = randomToken(32);
    const tokenHash = await sha256Hex(token);
    await authTokens.create({
      id: crypto.randomUUID(),
      userId: user.id,
      email: normalizedEmail,
      type: 'password_reset',
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    });

    const resetUrl = `${ctx.url.origin}/reset-password?token=${encodeURIComponent(token)}`;
    const { subject, html } = passwordResetEmail(resetUrl);
    await sendEmail(ctx.env, { to: normalizedEmail, subject, html, requestId: ctx.requestId });
    await logAuditEvent(ctx.env.DB, { actorUserId: user.id, action: 'auth.password_reset_requested', entityType: 'user', entityId: user.id });
  }

  // Always the same response -- instruction #9: generic regardless of
  // whether the account exists.
  return { status: 'sent' };
}

export async function resetPassword(ctx, { token, newPassword }) {
  const tokenHash = await sha256Hex(token);
  const record = await ctx.repositories.authTokens.findValidByTokenHash(tokenHash, 'password_reset');
  if (!record) {
    throw new ValidationError('This reset link is invalid or has expired.');
  }

  await ctx.repositories.authTokens.consume(record.id);
  const passwordHash = await hashPassword(newPassword);
  await ctx.repositories.users.updatePasswordHash(record.user_id, passwordHash, PASSWORD_ALGO);
  await ctx.repositories.sessions.revokeAllForUser(record.user_id);
  await logAuditEvent(ctx.env.DB, { actorUserId: record.user_id, action: 'auth.password_reset_succeeded', entityType: 'user', entityId: record.user_id });

  return { status: 'ok' };
}

export { SESSION_COOKIE, MARKER_COOKIE, CSRF_COOKIE, createSessionForUser };
