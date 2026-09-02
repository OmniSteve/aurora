import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { HttpError } from '../lib/http.js';
import { requireSession, requireCsrf } from '../lib/authGuard.js';
import { getCookie } from '../lib/cookies.js';
import { sha256Hex } from '../lib/crypto.js';
import { enforceRateLimit, getClientIp } from '../lib/rateLimit.js';
import { logAuditEvent } from '../lib/audit.js';
import { toSafeProfile } from '../repositories/usersRepository.js';
import * as authService from '../services/authService.js';
import { startGoogleOAuth, handleGoogleCallback } from '../services/googleOAuthService.js';

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(256);

const registerSchema = z.object({ email: emailSchema, password: passwordSchema, full_name: z.string().trim().max(200).optional() });
const verifyEmailSchema = z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/) });
const resendSchema = z.object({ email: emailSchema });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({ token: z.string().min(16).max(512), newPassword: passwordSchema });

export function registerAuthRoutes(router) {
  router.post('/api/auth/register', async (ctx) => {
    const body = await parseJsonBody(ctx.request, registerSchema);
    const email = authService.normalizeEmail(body.email);
    await enforceRateLimit(ctx, {
      action: 'register',
      identifier: email,
      limit: 5,
      windowSeconds: 3600,
      cfBinding: ctx.env.RL_AUTH,
      cfKey: getClientIp(ctx.request),
    });
    const result = await authService.register(ctx, { email, password: body.password, fullName: body.full_name });
    return ctx.json(result, 202);
  });

  router.post('/api/auth/verify-email', async (ctx) => {
    const body = await parseJsonBody(ctx.request, verifyEmailSchema);
    const email = authService.normalizeEmail(body.email);
    await enforceRateLimit(ctx, {
      action: 'verify-email',
      identifier: email,
      limit: 10,
      windowSeconds: 900,
      cfBinding: ctx.env.RL_AUTH,
      cfKey: getClientIp(ctx.request),
    });
    const { user, cookies } = await authService.verifyEmail(ctx, { email, code: body.code });
    return ctx.json({ user }, 200, cookies);
  });

  router.post('/api/auth/resend-verification', async (ctx) => {
    const { email } = await parseJsonBody(ctx.request, resendSchema);
    const normalized = authService.normalizeEmail(email);
    await enforceRateLimit(ctx, {
      action: 'resend-verification',
      identifier: normalized,
      limit: 3,
      windowSeconds: 900,
      cfBinding: ctx.env.RL_AUTH,
      cfKey: getClientIp(ctx.request),
    });
    const result = await authService.resendVerification(ctx, { email: normalized });
    return ctx.json(result);
  });

  router.post('/api/auth/login', async (ctx) => {
    const body = await parseJsonBody(ctx.request, loginSchema);
    const email = authService.normalizeEmail(body.email);
    try {
      await enforceRateLimit(ctx, {
        action: 'login',
        identifier: email,
        limit: 8,
        windowSeconds: 900,
        cfBinding: ctx.env.RL_AUTH,
        cfKey: getClientIp(ctx.request),
      });
    } catch (err) {
      if (err instanceof HttpError && err.code === 'too_many_requests') {
        await logAuditEvent(ctx.env.DB, { action: 'auth.login_rate_limited', entityType: 'login_attempt', details: { emailHash: await sha256Hex(email) } });
      }
      throw err;
    }
    const { user, cookies } = await authService.login(ctx, { email, password: body.password });
    return ctx.json({ user }, 200, cookies);
  });

  router.post('/api/auth/logout', async (ctx) => {
    const token = getCookie(ctx.request, authService.SESSION_COOKIE);
    if (token) {
      const tokenHash = await sha256Hex(token);
      const session = await ctx.repositories.sessions.findActiveByTokenHash(tokenHash);
      if (session) {
        await requireCsrf(ctx, session);
        await ctx.repositories.sessions.revoke(session.id);
        await logAuditEvent(ctx.env.DB, { actorUserId: session.user_id, action: 'auth.logout', entityType: 'session', entityId: session.id });
      }
    }
    // Always succeeds and always clears all three cookies, even if there
    // was never a valid session to revoke -- instruction #8.
    return ctx.json({ status: 'ok' }, 200, authService.clearSessionCookies());
  });

  router.post('/api/auth/forgot-password', async (ctx) => {
    const { email } = await parseJsonBody(ctx.request, forgotSchema);
    const normalized = authService.normalizeEmail(email);
    await enforceRateLimit(ctx, {
      action: 'forgot-password',
      identifier: normalized,
      limit: 5,
      windowSeconds: 900,
      cfBinding: ctx.env.RL_AUTH,
      cfKey: getClientIp(ctx.request),
    });
    const result = await authService.forgotPassword(ctx, { email: normalized });
    return ctx.json(result);
  });

  router.post('/api/auth/reset-password', async (ctx) => {
    const { token, newPassword } = await parseJsonBody(ctx.request, resetSchema);
    const tokenHash = await sha256Hex(token);
    await enforceRateLimit(ctx, {
      action: 'reset-password',
      identifier: tokenHash,
      limit: 5,
      windowSeconds: 900,
      cfBinding: ctx.env.RL_AUTH,
      cfKey: getClientIp(ctx.request),
    });
    const result = await authService.resetPassword(ctx, { token, newPassword });
    return ctx.json(result);
  });

  router.get('/api/auth/me', async (ctx) => {
    const { user } = await requireSession(ctx);
    return ctx.json({ user: toSafeProfile(user) });
  });

  router.get('/api/auth/google/start', async (ctx) => {
    await enforceRateLimit(ctx, {
      action: 'google-start',
      identifier: getClientIp(ctx.request),
      limit: 15,
      windowSeconds: 900,
      cfBinding: ctx.env.RL_AUTH,
      cfKey: getClientIp(ctx.request),
    });
    const returnTo = ctx.url.searchParams.get('returnTo');
    const redirectUrl = await startGoogleOAuth(ctx, { returnTo });
    return Response.redirect(redirectUrl, 302);
  });

  router.get('/api/auth/google/callback', async (ctx) => {
    await enforceRateLimit(ctx, {
      action: 'google-callback',
      identifier: getClientIp(ctx.request),
      limit: 15,
      windowSeconds: 900,
      cfBinding: ctx.env.RL_AUTH,
      cfKey: getClientIp(ctx.request),
    });
    const code = ctx.url.searchParams.get('code');
    const state = ctx.url.searchParams.get('state');
    const { returnTo, cookies } = await handleGoogleCallback(ctx, { code, state });
    const headers = new Headers({ location: returnTo });
    for (const cookie of cookies) headers.append('set-cookie', cookie);
    return new Response(null, { status: 302, headers });
  });
}
