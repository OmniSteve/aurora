import { jsonResponse } from '../lib/http.js';

// Outermost middleware: stamps every request with an id and gives
// downstream code a `ctx.json()` helper that always carries it, so error
// responses, route responses and log lines all agree on the same id.
export const withRequestId = (next) => async (ctx) => {
  ctx.requestId = crypto.randomUUID();
  ctx.json = (data, status = 200, cookies) => jsonResponse(data, status, ctx.requestId, cookies);
  return next(ctx);
};
