// Two independent layers, per the Phase 4 brief:
//
//   1. Cloudflare's Workers Rate Limiting binding -- a coarse, edge-local,
//      eventually-consistent IP throttle. Cheap, catches the bulk of
//      naive abuse before it costs a D1 round trip.
//   2. A D1-backed durable, per-identity counter (repositories/
//      rateLimitRepository.js) -- exact, survives across colos, and is
//      what actually enforces "5 login attempts per account per minute"
//      rather than "5 per edge location."
//
// Both are checked; either can reject the request. Identifiers are always
// HMAC'd (lib/crypto.js, keyed by the SECURITY_HASH_KEY secret) before
// they ever reach D1 -- no raw email or IP is stored in
// rate_limit_counters (instruction #12).
import { hmacSha256Hex } from './crypto.js';
import { TooManyRequestsError } from './http.js';

export async function enforceRateLimit(ctx, { action, identifier, limit, windowSeconds, cfBinding, cfKey }) {
  if (cfBinding && cfKey) {
    const { success } = await cfBinding.limit({ key: `${action}:${cfKey}` });
    if (!success) {
      throw new TooManyRequestsError('Too many requests. Please try again shortly.', windowSeconds);
    }
  }

  const key = await hmacSha256Hex(ctx.env.SECURITY_HASH_KEY, `${action}:${identifier}`);
  const count = await ctx.repositories.rateLimits.increment(key, windowSeconds);
  if (count > limit) {
    throw new TooManyRequestsError('Too many requests. Please try again shortly.', windowSeconds);
  }
}

// Client IP, for the CF binding's key only -- never written to D1 as-is.
export function getClientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}
