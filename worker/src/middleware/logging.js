// Structured (JSON-line) request logging, captured by `wrangler tail` /
// Logpush. Wraps errorHandling so it always logs the *final* status,
// including errors that got converted to a Response below it.
export const withLogging = (next) => async (ctx) => {
  const start = Date.now();
  const response = await next(ctx);
  console.log(JSON.stringify({
    requestId: ctx.requestId,
    method: ctx.request.method,
    path: ctx.url.pathname,
    status: response.status,
    durationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  }));
  return response;
};
