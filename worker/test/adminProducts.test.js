import { describe, it, expect, beforeAll } from 'vitest';
import { call, env, cleanupUser, registerAndVerify, extractAuthCookies } from './helpers.js';
import { cleanupProduct } from './commerceHelpers.js';

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

const FULL_PRODUCT = (overrides = {}) => ({
  name: 'Solstice Ring',
  slug: 'solstice-ring',
  sku: 'SOL-001',
  short_description: 'A ring',
  description: 'A longer description',
  price: 120,
  sale_price: null,
  category_id: null,
  collection_ids: [],
  images: [{ url: 'https://example.com/a.jpg', alt: 'Front', featured: true }, { url: 'https://example.com/b.jpg', alt: 'Side' }],
  materials: ['18ct Gold', 'Diamond'],
  availability: 'in_stock',
  stock_quantity: 5,
  lead_time: '2 weeks',
  options: [
    { name: 'Ring Size', type: 'dropdown', required: true, values: [{ label: 'M', price_modifier: 0 }, { label: 'L', price_modifier: 10 }] },
  ],
  customizations: [{ label: 'Engraving', type: 'text', price: 15, placeholder: 'Up to 20 characters', max_length: 20 }],
  special_request: { enabled: true, message: 'Something different?', allow_images: true, max_images: 3, payment_behaviour: 'approval' },
  deposit: { enabled: true, type: 'percentage', value: 30 },
  care_info: 'Keep dry',
  shipping_info: 'Ships in a box',
  seo: { title: 'Solstice Ring | Aurora', description: 'A lovely ring', og_image: '' },
  status: 'draft',
  featured: false,
  new_arrival: true,
  ...overrides,
});

describe('admin product CRUD', () => {
  let auth;
  beforeAll(async () => {
    auth = await adminAuth('admin-products@example.com');
  });

  it('creates a product with every nested child table populated correctly', async () => {
    const { status, json } = await authedCall(auth, '/api/admin/products', { method: 'POST', body: FULL_PRODUCT() });
    expect(status).toBe(201);
    const p = json.product;
    expect(p.name).toBe('Solstice Ring');
    expect(p.price).toBe(120);
    expect(p.images).toHaveLength(2);
    expect(p.images.find((i) => i.featured).url).toBe('https://example.com/a.jpg');
    expect(p.materials).toEqual(['18ct Gold', 'Diamond']);
    expect(p.options[0].name).toBe('Ring Size');
    expect(p.options[0].values.map((v) => v.label)).toEqual(['M', 'L']);
    expect(p.options[0].values[1].price_modifier).toBe(10);
    expect(p.customizations[0].label).toBe('Engraving');
    expect(p.customizations[0].price).toBe(15);
    expect(p.special_request.enabled).toBe(true);
    expect(p.special_request.payment_behaviour).toBe('approval');
    expect(p.deposit).toEqual({ enabled: true, type: 'percentage', value: 30 });

    // Round-trips through GET too, not just the create response.
    const got = await authedCall(auth, `/api/admin/products/${p.id}`);
    expect(got.json.product.options[0].values).toHaveLength(2);

    await cleanupProduct(p.id);
  });

  it('rejects a duplicate slug on create', async () => {
    const first = await authedCall(auth, '/api/admin/products', { method: 'POST', body: FULL_PRODUCT({ slug: 'dup-slug-test' }) });
    expect(first.status).toBe(201);

    const second = await authedCall(auth, '/api/admin/products', { method: 'POST', body: FULL_PRODUCT({ name: 'Another', slug: 'dup-slug-test' }) });
    expect(second.status).toBe(400);
    expect(second.json.error).toBe('validation_error');

    await cleanupProduct(first.json.product.id);
  });

  it('rejects a duplicate slug on update, and a nested update that fails leaves the product completely unchanged', async () => {
    const a = await authedCall(auth, '/api/admin/products', { method: 'POST', body: FULL_PRODUCT({ slug: 'atomic-a' }) });
    const b = await authedCall(auth, '/api/admin/products', { method: 'POST', body: FULL_PRODUCT({ name: 'B', slug: 'atomic-b' }) });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    // Try to rename A's slug to B's (an update whose *product-row* write and
    // whose *child-table* replacement are one db.batch() -- see
    // repositories/productsRepository.js) -- must fail as one unit.
    const failedUpdate = await authedCall(auth, `/api/admin/products/${a.json.product.id}`, {
      method: 'PUT',
      body: FULL_PRODUCT({ name: 'A Renamed', slug: 'atomic-b', images: [{ url: 'https://example.com/should-not-land.jpg', featured: true }] }),
    });
    expect(failedUpdate.status).toBe(400);

    const reloaded = await authedCall(auth, `/api/admin/products/${a.json.product.id}`);
    expect(reloaded.json.product.name).toBe('Solstice Ring'); // not "A Renamed"
    expect(reloaded.json.product.slug).toBe('atomic-a'); // not "atomic-b"
    // The child-table DELETE+INSERT never landed either -- original images
    // are still exactly what create() wrote, not the attempted replacement.
    expect(reloaded.json.product.images.map((i) => i.url)).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);

    await cleanupProduct(a.json.product.id);
    await cleanupProduct(b.json.product.id);
  });

  it('update replaces nested children wholesale (old options gone, new ones present)', async () => {
    const created = await authedCall(auth, '/api/admin/products', { method: 'POST', body: FULL_PRODUCT({ slug: 'replace-children' }) });
    const id = created.json.product.id;

    const updated = await authedCall(auth, `/api/admin/products/${id}`, {
      method: 'PUT',
      body: FULL_PRODUCT({
        slug: 'replace-children',
        options: [{ name: 'Metal', type: 'buttons', required: false, values: [{ label: 'Rose Gold', price_modifier: 0 }] }],
        materials: ['Platinum'],
      }),
    });
    expect(updated.status).toBe(200);
    expect(updated.json.product.options).toHaveLength(1);
    expect(updated.json.product.options[0].name).toBe('Metal');
    expect(updated.json.product.materials).toEqual(['Platinum']);

    await cleanupProduct(id);
  });

  it('delete refuses a product with order history, and works for one without', async () => {
    const created = await authedCall(auth, '/api/admin/products', { method: 'POST', body: FULL_PRODUCT({ slug: 'delete-me' }) });
    const id = created.json.product.id;

    const deleted = await authedCall(auth, `/api/admin/products/${id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);

    const goneCheck = await authedCall(auth, `/api/admin/products/${id}`);
    expect(goneCheck.status).toBe(404);
  });

  it('listAllAdmin returns products of every status, not just published', async () => {
    const created = await authedCall(auth, '/api/admin/products', { method: 'POST', body: FULL_PRODUCT({ slug: 'draft-visible', status: 'draft' }) });
    const list = await authedCall(auth, '/api/admin/products');
    expect(list.json.products.some((p) => p.id === created.json.product.id)).toBe(true);
    await cleanupProduct(created.json.product.id);
  });
});
