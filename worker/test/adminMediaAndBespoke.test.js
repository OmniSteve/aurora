import { describe, it, expect, vi } from 'vitest';
import { env, call, cleanupUser, registerAndVerify, extractAuthCookies } from './helpers.js';
import worker from '../src/index.js';

async function adminAuth(email) {
  await cleanupUser(email);
  const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
  await env.DB.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).bind(email).run();
  return extractAuthCookies(cookies);
}

// helpers.js's call() always JSON-encodes `body`; multipart uploads need a
// real FormData body instead, so this builds the Request directly.
async function uploadFile(path, { cookies = {}, headers = {} } = {}) {
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  const form = new FormData();
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Array(50).fill(0)]); // PNG-ish magic + padding
  form.append('file', new File([bytes], 'test.png', { type: 'image/png' }));
  const response = await worker.fetch(
    new Request(`https://example.com${path}`, {
      method: 'POST',
      headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), origin: 'https://example.com', 'cf-connecting-ip': crypto.randomUUID(), ...headers },
      body: form,
    }),
    env,
  );
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

describe('admin media upload', () => {
  it('an admin can upload a catalogue image to the public bucket', async () => {
    const auth = await adminAuth('admin-media@example.com');
    const { status, json } = await uploadFile('/api/admin/media', {
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
    });
    expect(status).toBe(201);
    expect(json.url).toMatch(/^\/media\/products\/.+\.png$/);

    // Actually served back from the public bucket.
    const served = await worker.fetch(new Request(`https://example.com${json.url}`), env);
    expect(served.status).toBe(200);
  });

  it('rejects a non-image content type', async () => {
    const auth = await adminAuth('admin-media-badtype@example.com');
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'evil.exe', { type: 'application/octet-stream' }));
    const response = await worker.fetch(
      new Request('https://example.com/api/admin/media', {
        method: 'POST',
        headers: { cookie: `aurora_session=${auth.session}; aurora_csrf=${auth.csrf}`, origin: 'https://example.com', 'x-csrf-token': auth.csrf, 'cf-connecting-ip': crypto.randomUUID() },
        body: form,
      }),
      env,
    );
    expect(response.status).toBe(400);
  });
});

describe('anonymous private uploads and access control', () => {
  it('an anonymous upload lands in the private bucket and is retrievable only with its token', async () => {
    const { status, json } = await uploadFile('/api/uploads/private');
    expect(status).toBe(201);
    expect(json.url).toMatch(/^\/media-private\/.+\?token=.+$/);

    const withToken = await worker.fetch(new Request(`https://example.com${json.url}`), env);
    expect(withToken.status).toBe(200);

    const [pathOnly] = json.url.split('?');
    const withoutToken = await worker.fetch(new Request(`https://example.com${pathOnly}`), env);
    expect(withoutToken.status).toBe(404); // not merely 401 -- existence isn't confirmed either
  });

  it('an admin session alone (no token) can also view a private upload', async () => {
    const { json } = await uploadFile('/api/uploads/private');
    const [pathOnly] = json.url.split('?');
    const auth = await adminAuth('admin-private-view@example.com');
    const response = await worker.fetch(
      new Request(`https://example.com${pathOnly}`, { headers: { cookie: `aurora_session=${auth.session}` } }),
      env,
    );
    expect(response.status).toBe(200);
  });

  it('a wrong token is rejected', async () => {
    const { json } = await uploadFile('/api/uploads/private');
    const [pathOnly] = json.url.split('?');
    const response = await worker.fetch(new Request(`https://example.com${pathOnly}?token=not-the-real-token`), env);
    expect(response.status).toBe(404);
  });
});

describe('bespoke request flow', () => {
  it('a public request is created, acknowledged by email, and visible to admin; admin can update status/quote/notes', async () => {
    const emailLib = await import('../src/lib/email.js');
    const sent = [];
    const spy = vi.spyOn(emailLib, 'sendEmail').mockImplementation(async (_env, opts) => { sent.push(opts); return { sent: true }; });

    const created = await call('/api/bespoke', {
      method: 'POST',
      body: {
        customer_name: 'Jamie Test', email: 'bespoke-test@example.com', jewellery_type: 'Ring',
        description: 'A twisted band', reference_images: ['/media-private/fake-id?token=fake'],
      },
    });
    expect(created.status).toBe(201);
    expect(created.json.request.status).toBe('new');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('bespoke-test@example.com');
    spy.mockRestore();

    const auth = await adminAuth('admin-bespoke@example.com');
    const list = await call('/api/admin/bespoke', { cookies: { aurora_session: auth.session } });
    expect(list.json.requests.some((r) => r.id === created.json.request.id)).toBe(true);

    const updated = await call(`/api/admin/bespoke/${created.json.request.id}`, {
      method: 'PUT',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
      body: { status: 'quote_prepared', quote: { price: 850, deposit_type: 'percentage', deposit_value: 30, description: 'Handmade band' } },
    });
    expect(updated.json.request.status).toBe('quote_prepared');
    expect(updated.json.request.quote.price).toBe(850);

    const noted = await call(`/api/admin/bespoke/${created.json.request.id}/notes`, {
      method: 'POST',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
      body: { text: 'Called customer, confirmed sizing.' },
    });
    expect(noted.json.request.internal_notes).toHaveLength(1);
    expect(noted.json.request.internal_notes[0].text).toBe('Called customer, confirmed sizing.');
  });

  it('a non-admin cannot update a bespoke request', async () => {
    const created = await call('/api/bespoke', { method: 'POST', body: { customer_name: 'X', email: 'bespoke-nonadmin@example.com' } });
    const email = 'bespoke-not-admin@example.com';
    await cleanupUser(email);
    const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
    const auth = extractAuthCookies(cookies);
    const { status } = await call(`/api/admin/bespoke/${created.json.request.id}`, {
      method: 'PUT',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
      body: { status: 'accepted' },
    });
    expect(status).toBe(403);
    await cleanupUser(email);
  });
});
