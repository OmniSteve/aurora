import { randomToken, sha256Hex } from '../lib/crypto.js';
import { toBase64Url } from '../lib/crypto.js';
import { HttpError, ValidationError } from '../lib/http.js';
import { logAuditEvent } from '../lib/audit.js';
import { toSafeProfile } from '../repositories/usersRepository.js';
import { createSessionForUser } from './authService.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Server-side ID token validation via Google's own tokeninfo endpoint,
// rather than implementing JWKS/JWT signature verification in the Worker.
// Google validates signature, audience and expiry for us over TLS; the
// tradeoff is tokeninfo's documented rate limits, which are irrelevant at
// this project's scale. Revisit with local JWKS verification if that ever
// changes.
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

// --- returnTo sanitization -------------------------------------------------
// Mirrors src/lib/authReturnTo.js's protections server-side: this is now
// the authoritative check (the OAuth redirect never trusts a client-signed
// URL), but the same open-redirect class of bug applies, so the same rules
// apply: exactly one leading slash, no `//`, no backslash.
export function sanitizeReturnTo(raw) {
  if (!raw || typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}

// --- Account linking policy (instruction #11) ------------------------------
// Documented policy, implemented as a pure function so the decision logic
// can be tested exhaustively without a live Google connection or a real D1
// database (worker/test/googleLinking.test.js):
//
//   1. google_sub is authoritative once linked -- if a user already owns
//      this sub, that IS the account. No further checks.
//   2. Otherwise, link to an existing LOCAL account only if ALL of:
//        - an Aurora account exists with this email, AND
//        - that Aurora account's own email_verified = 1 (never link to an
//          unverified local account purely because an email string
//          matches -- instruction explicit), AND
//        - Google itself reports email_verified = true for this identity
//          (never trust an unverified email assertion from the IdP either).
//   3. Otherwise, create a brand new account. Google vouches for the
//      email, so the new account is created already email_verified = 1.
//
// The email in this decision always comes from Google's own validated
// tokeninfo response, never from client-supplied input -- there is no path
// in this flow where a user-controlled email string reaches this function.
export function decideGoogleAccountLink({ existingByGoogleSub, existingByEmail, googleEmailVerified }) {
  if (existingByGoogleSub) return { action: 'login', userId: existingByGoogleSub.id };

  if (existingByEmail && existingByEmail.email_verified && googleEmailVerified) {
    return { action: 'link', userId: existingByEmail.id };
  }

  return { action: 'create' };
}

// --- PKCE -------------------------------------------------------------
async function generatePkce() {
  const verifier = randomToken(48); // 64 base64url chars, within the RFC 7636 43-128 range
  const challenge = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

function requireGoogleConfigured(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(503, 'not_configured', 'Google sign-in is not configured yet.');
  }
}

export async function startGoogleOAuth(ctx, { returnTo }) {
  requireGoogleConfigured(ctx.env);

  const safeReturnTo = sanitizeReturnTo(returnTo);
  const { verifier, challenge } = await generatePkce();
  const state = randomToken(24);
  const stateHash = await sha256Hex(state);

  await ctx.repositories.oauthStates.create({
    id: crypto.randomUUID(),
    stateHash,
    pkceVerifier: verifier,
    returnTo: safeReturnTo,
    expiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });

  const redirectUri = `${ctx.url.origin}/api/auth/google/callback`;
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', ctx.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('prompt', 'select_account');

  return authUrl.toString();
}

export async function handleGoogleCallback(ctx, { code, state }) {
  requireGoogleConfigured(ctx.env);

  if (!code || !state) throw new ValidationError('Missing code or state.');

  const stateHash = await sha256Hex(state);
  const record = await ctx.repositories.oauthStates.findValidByStateHash(stateHash);
  if (!record) throw new HttpError(400, 'oauth_state_invalid', 'This sign-in link has expired or was already used.');

  const consumed = await ctx.repositories.oauthStates.consume(record.id);
  if (!consumed) throw new HttpError(400, 'oauth_state_invalid', 'This sign-in link has expired or was already used.');

  const redirectUri = `${ctx.url.origin}/api/auth/google/callback`;
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: ctx.env.GOOGLE_CLIENT_ID,
      client_secret: ctx.env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: record.pkce_verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    console.error(JSON.stringify({ requestId: ctx.requestId, scope: 'google_token_exchange_failed', status: tokenResponse.status }));
    throw new HttpError(502, 'oauth_provider_error', 'Google sign-in failed. Please try again.');
  }
  const tokenBody = await tokenResponse.json();

  const infoResponse = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(tokenBody.id_token)}`);
  if (!infoResponse.ok) {
    throw new HttpError(502, 'oauth_provider_error', 'Google sign-in failed. Please try again.');
  }
  const identity = await infoResponse.json();

  if (!identity.sub || !identity.email) {
    throw new HttpError(502, 'oauth_provider_error', 'Google sign-in failed. Please try again.');
  }

  const googleEmailVerified = identity.email_verified === 'true' || identity.email_verified === true;
  const email = String(identity.email).trim().toLowerCase();

  const [existingByGoogleSub, existingByEmail] = await Promise.all([
    ctx.repositories.users.findByGoogleSub(identity.sub),
    ctx.repositories.users.findByEmail(email),
  ]);

  const decision = decideGoogleAccountLink({ existingByGoogleSub, existingByEmail, googleEmailVerified });

  let user;
  if (decision.action === 'login') {
    user = await ctx.repositories.users.findById(decision.userId);
  } else if (decision.action === 'link') {
    const linked = await ctx.repositories.users.linkGoogleSub(decision.userId, identity.sub);
    if (!linked) {
      // Someone else claimed this google_sub between the check above and
      // now (race, or a second concurrent callback for the same code) --
      // UNIQUE(google_sub) plus the conditional UPDATE in linkGoogleSub is
      // the actual last line of defense. Fail closed.
      throw new HttpError(409, 'oauth_link_conflict', 'This Google account is already linked to another user.');
    }
    user = await ctx.repositories.users.findById(decision.userId);
    await logAuditEvent(ctx.env.DB, { actorUserId: user.id, action: 'auth.google_account_linked', entityType: 'user', entityId: user.id });
  } else {
    user = await ctx.repositories.users.createFromGoogle({
      id: crypto.randomUUID(),
      email,
      fullName: identity.name || null,
      googleSub: identity.sub,
    });
  }

  await logAuditEvent(ctx.env.DB, { actorUserId: user.id, action: 'auth.google_login', entityType: 'user', entityId: user.id });

  const { cookies } = await createSessionForUser(ctx, user);
  return { user: toSafeProfile(user), returnTo: record.return_to, cookies };
}
