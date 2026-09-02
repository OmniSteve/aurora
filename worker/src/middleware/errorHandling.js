import { HttpError } from '../lib/http.js';

// Innermost middleware, wrapping the router dispatch directly. Converts
// every thrown error into a JSON response here, in exactly one place --
// route handlers and repositories are free to just `throw`.
//
// HttpError subclasses (ValidationError, NotFoundError, ...) carry the
// status/code/message that's safe to show a client. Anything else (a raw
// D1/SQLite error, a bug) is logged in full server-side and reduced to a
// generic 500 -- no stack trace or driver error text ever reaches a caller.
export const withErrorHandling = (next) => async (ctx) => {
  try {
    return await next(ctx);
  } catch (err) {
    if (err instanceof HttpError) {
      return ctx.json(
        { error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
        err.status,
      );
    }
    console.error(JSON.stringify({
      requestId: ctx.requestId,
      scope: 'unhandled_error',
      error: String((err && err.stack) || err),
    }));
    return ctx.json({ error: 'internal_error', message: 'Something went wrong.' }, 500);
  }
};
