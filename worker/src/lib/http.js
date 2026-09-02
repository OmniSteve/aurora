// Typed errors + the one place response envelopes are constructed. Route
// handlers throw these; middleware/errorHandling.js turns them into JSON.

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Invalid request', details) {
    super(400, 'validation_error', message, details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class AuthRequiredError extends HttpError {
  constructor(message = 'Authentication required') {
    super(401, 'auth_required', message);
  }
}

export class NotImplementedError extends HttpError {
  constructor(message = 'Not available yet') {
    super(501, 'not_implemented', message);
  }
}

export class MethodNotAllowedError extends HttpError {
  constructor(message = 'Method not allowed') {
    super(405, 'method_not_allowed', message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, 'forbidden', message);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = 'Too many requests', retryAfterSeconds) {
    super(429, 'too_many_requests', message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Same-origin deployment: the Worker serves both the SPA and /api/* from one
// origin (wrangler.jsonc run_worker_first), so no cross-origin caller is
// expected and no CORS headers are added. Revisit deliberately if a separate
// origin ever needs API access.
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function jsonResponse(data, status = 200, requestId, cookies) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    ...SECURITY_HEADERS,
  });
  if (requestId) headers.set('x-request-id', requestId);
  // Headers.append is required (not .set) so multiple Set-Cookie headers
  // survive on the wire -- one call per cookie, e.g. session + marker + CSRF
  // on login, or three cleared cookies on logout.
  if (cookies) {
    for (const cookie of cookies) headers.append('set-cookie', cookie);
  }
  return new Response(JSON.stringify(data), { status, headers });
}
