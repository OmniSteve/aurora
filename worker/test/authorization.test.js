import { describe, it, expect } from 'vitest';
import { call, env, cleanupUser, registerAndVerify, extractAuthCookies } from './helpers.js';

describe('admin authorisation gate', () => {
  it('anonymous -> 401', async () => {
    const { status, json } = await call('/api/admin/products');
    expect(status).toBe(401);
    expect(json.error).toBe('auth_required');
  });

  it('authenticated normal user -> 403', async () => {
    const email = 'authz-normal-user@example.com';
    await cleanupUser(email);
    const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
    const session = extractAuthCookies(cookies).session;

    const { status, json } = await call('/api/admin/products', { cookies: { aurora_session: session } });
    expect(status).toBe(403);
    expect(json.error).toBe('forbidden');

    await cleanupUser(email);
  });

  it('admin -> passes the gate, reaches the real route handler', async () => {
    const email = 'authz-admin@example.com';
    await cleanupUser(email);
    const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
    await env.DB.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).bind(email).run();
    const session = extractAuthCookies(cookies).session;

    const { status, json } = await call('/api/admin/products', { cookies: { aurora_session: session } });
    expect(status).toBe(200);
    expect(Array.isArray(json.products)).toBe(true);

    await cleanupUser(email);
  });

  it('role is read from the database at request time, never trusted from the client', async () => {
    // There is no mechanism in the request (body, header, cookie) that can
    // set role -- prove it by sending an admin-looking body on a normal
    // user's session and confirming it still 403s.
    const email = 'authz-no-client-role@example.com';
    await cleanupUser(email);
    const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
    const session = extractAuthCookies(cookies).session;

    const { status } = await call('/api/admin/products', {
      cookies: { aurora_session: session },
      headers: { 'x-user-role': 'admin' }, // not a header the server reads for anything
    });
    expect(status).toBe(403);

    await cleanupUser(email);
  });
});
