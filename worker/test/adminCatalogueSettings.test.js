import { describe, it, expect, beforeAll } from 'vitest';
import { call, env, cleanupUser, registerAndVerify, extractAuthCookies } from './helpers.js';

async function adminAuth(email) {
  await cleanupUser(email);
  const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
  await env.DB.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).bind(email).run();
  return extractAuthCookies(cookies);
}

function authedCall(auth, path, opts = {}) {
  return call(path, {
    ...opts,
    cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf, ...(opts.cookies || {}) },
    headers: { 'x-csrf-token': auth.csrf, ...(opts.headers || {}) },
  });
}

describe('admin categories/collections/discounts CRUD', () => {
  let auth;
  beforeAll(async () => { auth = await adminAuth('admin-catalogue@example.com'); });

  it('category create/update/delete round-trips', async () => {
    const created = await authedCall(auth, '/api/admin/categories', { method: 'POST', body: { name: 'Rings', slug: 'rings-test', sort_order: 1 } });
    expect(created.status).toBe(201);
    expect(created.json.category.name).toBe('Rings');

    const updated = await authedCall(auth, `/api/admin/categories/${created.json.category.id}`, { method: 'PUT', body: { name: 'Fine Rings', slug: 'rings-test', published: false } });
    expect(updated.json.category.name).toBe('Fine Rings');
    expect(updated.json.category.published).toBe(false);

    const list = await authedCall(auth, '/api/admin/categories');
    expect(list.json.categories.some((c) => c.id === created.json.category.id)).toBe(true);

    const deleted = await authedCall(auth, `/api/admin/categories/${created.json.category.id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
  });

  it('collection create/update/delete round-trips', async () => {
    const created = await authedCall(auth, '/api/admin/collections', { method: 'POST', body: { name: 'Summer', slug: 'summer-test', featured: true } });
    expect(created.status).toBe(201);

    const updated = await authedCall(auth, `/api/admin/collections/${created.json.collection.id}`, { method: 'PUT', body: { name: 'Summer 2026', slug: 'summer-test', featured: false } });
    expect(updated.json.collection.name).toBe('Summer 2026');

    const deleted = await authedCall(auth, `/api/admin/collections/${created.json.collection.id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
  });

  it('discount create/update round-trips, code is uppercased, fixed value stored/returned correctly', async () => {
    const created = await authedCall(auth, '/api/admin/discounts', { method: 'POST', body: { code: 'save10test', type: 'fixed', value: 10, min_spend: 20 } });
    expect(created.status).toBe(201);
    expect(created.json.discount.code).toBe('SAVE10TEST');
    expect(created.json.discount.value).toBe(10); // pounds, round-tripped through cents
    expect(created.json.discount.min_spend).toBe(20);

    const updated = await authedCall(auth, `/api/admin/discounts/${created.json.discount.id}`, { method: 'PUT', body: { type: 'percentage', value: 15, active: false } });
    expect(updated.json.discount.type).toBe('percentage');
    expect(updated.json.discount.value).toBe(15);
    expect(updated.json.discount.active).toBe(false);
  });

  it('a duplicate discount code is rejected', async () => {
    const first = await authedCall(auth, '/api/admin/discounts', { method: 'POST', body: { code: 'DUPETEST', type: 'fixed', value: 5 } });
    expect(first.status).toBe(201);
    const second = await authedCall(auth, '/api/admin/discounts', { method: 'POST', body: { code: 'dupetest', type: 'fixed', value: 5 } });
    expect(second.status).toBe(400);
  });
});

describe('admin settings', () => {
  let auth;
  beforeAll(async () => { auth = await adminAuth('admin-settings@example.com'); });

  it('save() persists full settings including shipping methods; getAdmin() reflects it all, getPublic() withholds only phone/Stripe flags', async () => {
    const save = await authedCall(auth, '/api/admin/settings', {
      method: 'PUT',
      body: {
        store_name: 'Aurora Test', email: 'shop@example.com', phone: '01234', address: '1 Test St',
        currency: 'GBP', currency_symbol: '£', tax_rate: 21, prices_include_tax: true,
        instagram: 'https://instagram.com/aurora', shipping_methods: [{ name: 'Express', price: 9.99, estimate: '1 day', free_over: 100 }],
        stripe_enabled: false, stripe_test_mode: true,
      },
    });
    expect(save.status).toBe(200);
    expect(save.json.settings.shipping_methods).toEqual([{ name: 'Express', price: 9.99, estimate: '1 day', free_over: 100 }]);

    const admin = await authedCall(auth, '/api/admin/settings');
    expect(admin.json.settings.email).toBe('shop@example.com');
    expect(admin.json.settings.phone).toBe('01234');
    expect(admin.json.settings.tax_rate).toBe(21);

    const pub = await call('/api/settings');
    // Public footer fields ARE exposed -- this is what Footer.jsx renders.
    expect(pub.json.settings.email).toBe('shop@example.com');
    expect(pub.json.settings.address).toBe('1 Test St');
    expect(pub.json.settings.instagram).toBe('https://instagram.com/aurora');
    // Genuinely internal/non-public fields stay withheld.
    expect(pub.json.settings.phone).toBeUndefined();
    expect(pub.json.settings.stripe_enabled).toBeUndefined();
    expect(pub.json.settings.stripe_test_mode).toBeUndefined();
    expect(pub.json.settings.shipping_methods).toEqual([{ name: 'Express', price: 9.99, estimate: '1 day', free_over: 100 }]);
  });

  it('replacing shipping methods drops the old ones, not just adds', async () => {
    await authedCall(auth, '/api/admin/settings', { method: 'PUT', body: { shipping_methods: [{ name: 'Only Method', price: 1 }] } });
    const admin = await authedCall(auth, '/api/admin/settings');
    expect(admin.json.settings.shipping_methods).toHaveLength(1);
    expect(admin.json.settings.shipping_methods[0].name).toBe('Only Method');
  });
});

describe('admin users and newsletter lists', () => {
  it('users.listAllSafe never exposes password_hash or google_sub', async () => {
    const auth = await adminAuth('admin-userslist@example.com');
    const { json } = await authedCall(auth, '/api/admin/users');
    expect(Array.isArray(json.users)).toBe(true);
    const self = json.users.find((u) => u.email === 'admin-userslist@example.com');
    expect(self).toBeTruthy();
    expect(self.password_hash).toBeUndefined();
    expect(self.google_sub).toBeUndefined();
    expect(self.role).toBe('admin');
  });

  it('newsletter.listAll reflects subscribers', async () => {
    const auth = await adminAuth('admin-newsletterlist@example.com');
    await call('/api/newsletter/subscribe', { method: 'POST', body: { email: 'subscriber-admintest@example.com' } });
    const { json } = await authedCall(auth, '/api/admin/newsletter');
    expect(json.subscribers.some((s) => s.email === 'subscriber-admintest@example.com')).toBe(true);
  });
});
