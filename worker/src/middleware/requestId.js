import { jsonResponse } from '../lib/http.js';

// Outermost middleware: stamps every request with an id and gives
// downstream code a `ctx.json()` helper that always carries it, so error
// responses, route responses and log lines all agree on the same id.
//
// ctx.extraCookies is for cookies that must land on this response
// regardless of whether the route ultimately succeeds or throws -- e.g. a
// freshly-minted anonymous checkout correlator cookie (routes/orders.js)
// needs to reach the caller even when the request itself fails validation,
// or a retry can never be recognised as the same caller. Routes set
// ctx.extraCookies directly; ctx.json merges them into every response
// automatically, and so does the error-handling middleware, since it also
// calls ctx.json.
export const withRequestId = (next) => async (ctx) => {
  ctx.requestId = crypto.randomUUID();
  ctx.extraCookies = [];
  ctx.json = (data, status = 200, cookies) => jsonResponse(data, status, ctx.requestId, [...ctx.extraCookies, ...(cookies || [])]);
  return next(ctx);
};
