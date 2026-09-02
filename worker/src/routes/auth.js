import { AuthRequiredError, NotImplementedError } from '../lib/http.js';

// Phase 4 owns real sessions. What exists here is the honest current state:
// nobody can ever be authenticated (GET /api/auth/me always 401), and every
// mutation explicitly says so rather than pretending to work. checkAccess/
// hasSession/logout have no server-side counterpart yet -- see
// src/api/backend/cloudflare.js, which implements them client-side only
// (there is nothing on the server for them to do until Phase 4).
export function registerAuthRoutes(router) {
  router.get('/api/auth/me', async () => {
    throw new AuthRequiredError();
  });

  const notImplemented = (path) =>
    router.post(path, async () => {
      throw new NotImplementedError('Authentication is not implemented yet.');
    });

  notImplemented('/api/auth/login');
  notImplemented('/api/auth/register');
  notImplemented('/api/auth/verify-email');
  notImplemented('/api/auth/resend-verification');
  notImplemented('/api/auth/forgot-password');
  notImplemented('/api/auth/reset-password');
}
