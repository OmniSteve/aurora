// Real session + role checking, replacing the Phase 3 stub
// (worker/src/lib/adminGate.js, now unused). Route handlers call these
// explicitly rather than the router applying per-route middleware --
// keeps the router minimal and makes each route's security requirement
// visible at the top of its handler.
import { getCookie } from './cookies.js';
import { sha256Hex, constantTimeEqualHex } from './crypto.js';
import { AuthRequiredError, ForbiddenError } from './http.js';

const SESSION_COOKIE = 'aurora_session';
const CSRF_HEADER = 'x-csrf-token';

// Session freshness: only touch last_seen_at if it's more than 5 minutes
// stale, so an active browsing session doesn't write to D1 on every single
// request (see the Phase 4 checkpoint's session-lifecycle notes).
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export async function requireSession(ctx) {
  const token = getCookie(ctx.request, SESSION_COOKIE);
  if (!token) throw new AuthRequiredError();

  const tokenHash = await sha256Hex(token);
  const session = await ctx.repositories.sessions.findActiveByTokenHash(tokenHash);
  if (!session) throw new AuthRequiredError();

  const user = await ctx.repositories.users.findById(session.user_id);
  if (!user) throw new AuthRequiredError();

  const lastSeenAgeMs = Date.now() - new Date(session.last_seen_at).getTime();
  if (lastSeenAgeMs > LAST_SEEN_THROTTLE_MS) {
    await ctx.repositories.sessions.touchLastSeen(session.id);
  }

  ctx.session = session;
  ctx.user = user;
  return { session, user };
}

export async function requireAdmin(ctx) {
  const { session, user } = await requireSession(ctx);
  if (user.role !== 'admin') {
    throw new ForbiddenError('Admin access required.');
  }
  return { session, user };
}

// CSRF applies only to unsafe methods on requests that carry a session
// cookie -- there is no ambient authority to forge for an anonymous POST
// (newsletter subscribe, discount validate), so those are unaffected. Call
// this *after* requireSession/requireAdmin so `session` is already loaded.
//
// Two independent checks, per the design brief: the caller must present the
// CSRF token bound to *this* session (not just any valid-looking token --
// double-submit-cookie alone is a weaker, cookie-only control), and the
// request's Origin must be this same-origin deployment. Neither check
// alone is sufficient defense-in-depth on its own.
export async function requireCsrf(ctx, session) {
  const method = ctx.request.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const origin = ctx.request.headers.get('origin');
  if (!origin || origin !== ctx.url.origin) {
    throw new ForbiddenError('Request origin is not allowed.');
  }

  const provided = ctx.request.headers.get(CSRF_HEADER);
  if (!provided || !session.csrf_token_hash) {
    throw new ForbiddenError('Missing CSRF token.');
  }

  const providedHash = await sha256Hex(provided);
  if (!constantTimeEqualHex(providedHash, session.csrf_token_hash)) {
    throw new ForbiddenError('Invalid CSRF token.');
  }
}

export { SESSION_COOKIE };
