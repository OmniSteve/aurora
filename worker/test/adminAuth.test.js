import { describe, it, expect } from 'vitest';
import { call, cleanupUser, registerAndVerify, extractAuthCookies } from './helpers.js';

// Cross-cutting: every admin endpoint introduced in Phase 8 must be behind
// requireAdmin -- anonymous 401, authenticated non-admin 403. Deliberately
// only checks the gate itself (status codes), not each route's business
// logic (covered per-resource in the other adminX.test.js files).
const ADMIN_GETS = [
  '/api/admin/categories',
  '/api/admin/collections',
  '/api/admin/discounts',
  '/api/admin/settings',
  '/api/admin/users',
  '/api/admin/newsletter',
  '/api/admin/orders',
  '/api/admin/bespoke',
];

describe('admin auth gate covers every Phase 8 admin endpoint', () => {
  it.each(ADMIN_GETS)('anonymous -> 401 for %s', async (path) => {
    const { status, json } = await call(path);
    expect(status).toBe(401);
    expect(json.error).toBe('auth_required');
  });

  it.each(ADMIN_GETS)('authenticated non-admin -> 403 for %s', async (path) => {
    const email = `adminauth-${path.replace(/\W+/g, '-')}@example.com`;
    await cleanupUser(email);
    const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
    const session = extractAuthCookies(cookies).session;

    const { status, json } = await call(path, { cookies: { aurora_session: session } });
    expect(status).toBe(403);
    expect(json.error).toBe('forbidden');

    await cleanupUser(email);
  });

  it('anonymous admin media upload -> 401 (requireAdmin runs before the body is ever read)', async () => {
    const { status } = await call('/api/admin/media', { method: 'POST', body: {} });
    expect(status).toBe(401);
  });
});
