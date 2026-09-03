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

// Regression coverage for the Materials bug: BasicsTab.jsx used to derive
// the input's displayed value from materials.join(', ') on every render,
// reformatting it out from under a mid-typing cursor on every keystroke --
// which is what mangled "Blue Aquamarine, Rose Quartz" into concatenated
// nonsense. The actual cursor-jump behaviour is a React/DOM concern that
// can't be exercised here (this repo has no frontend component-test
// harness -- the only vitest config here targets worker/test/** against
// the Workers pool, no jsdom/React Testing Library), so these tests cover
// everything on the data side: what the fixed admin UI actually sends
// (a real array, since it now parses on every keystroke instead of
// reformatting the visible text) is stored and read back correctly, and
// normalizeMaterials() in productsRepository.js -- the server-side
// guarantee, not just a UI nicety -- trims/dedupes regardless of what any
// client sends. The GET round-trip used throughout is exactly what both
// AdminProductEdit.jsx (edit form reconstruction) and the public product
// API (storefront display) rely on.
describe('product materials normalisation', () => {
  let auth;
  beforeAll(async () => {
    auth = await adminAuth('admin-materials@example.com');
  });

  it('a material name containing a space is stored and read back exactly, untruncated', async () => {
    const created = await authedCall(auth, '/api/admin/products', {
      method: 'POST',
      body: FULL_PRODUCT({ slug: 'materials-space-test', materials: ['Rose Quartz'] }),
    });
    expect(created.status).toBe(201);
    expect(created.json.product.materials).toEqual(['Rose Quartz']);

    const got = await authedCall(auth, `/api/admin/products/${created.json.product.id}`);
    expect(got.json.product.materials).toEqual(['Rose Quartz']);

    await cleanupProduct(created.json.product.id);
  });

  it('multiple materials are stored as separate entries, not concatenated', async () => {
    const created = await authedCall(auth, '/api/admin/products', {
      method: 'POST',
      body: FULL_PRODUCT({ slug: 'materials-multi-test', materials: ['Blue Aquamarine', 'Rose Quartz'] }),
    });
    expect(created.status).toBe(201);
    expect(created.json.product.materials).toEqual(['Blue Aquamarine', 'Rose Quartz']);
    // Never a single concatenated string -- the exact failure mode reported.
    expect(created.json.product.materials).not.toContain('AquamarineRoseQuarts');
    expect(created.json.product.materials).not.toContain('BlueAquamarineRoseQuartz');

    const rows = await env.DB.prepare(`SELECT material FROM product_materials WHERE product_id = ? ORDER BY sort_order`).bind(created.json.product.id).all();
    expect(rows.results.map((r) => r.material)).toEqual(['Blue Aquamarine', 'Rose Quartz']);

    await cleanupProduct(created.json.product.id);
  });

  it('surrounding whitespace is trimmed from each material', async () => {
    const created = await authedCall(auth, '/api/admin/products', {
      method: 'POST',
      body: FULL_PRODUCT({ slug: 'materials-trim-test', materials: ['  Sterling Silver ', ' 18ct Gold  '] }),
    });
    expect(created.status).toBe(201);
    expect(created.json.product.materials).toEqual(['Sterling Silver', '18ct Gold']);

    await cleanupProduct(created.json.product.id);
  });

  it('empty entries are dropped and duplicate materials collapse to one', async () => {
    const created = await authedCall(auth, '/api/admin/products', {
      method: 'POST',
      body: FULL_PRODUCT({ slug: 'materials-dedupe-test', materials: ['Gold', '', 'Gold', ' Gold ', 'Diamond'] }),
    });
    expect(created.status).toBe(201);
    expect(created.json.product.materials).toEqual(['Gold', 'Diamond']);

    await cleanupProduct(created.json.product.id);
  });

  it('an update replaces materials wholesale, still normalised', async () => {
    const created = await authedCall(auth, '/api/admin/products', {
      method: 'POST',
      body: FULL_PRODUCT({ slug: 'materials-update-test', materials: ['Platinum'] }),
    });
    const id = created.json.product.id;

    const updated = await authedCall(auth, `/api/admin/products/${id}`, {
      method: 'PUT',
      body: FULL_PRODUCT({ slug: 'materials-update-test', materials: [' Blue Aquamarine ', 'Rose Quartz', 'Rose Quartz'] }),
    });
    expect(updated.status).toBe(200);
    expect(updated.json.product.materials).toEqual(['Blue Aquamarine', 'Rose Quartz']);

    await cleanupProduct(id);
  });

  it('the public storefront API returns materials as separate names for a published product', async () => {
    const created = await authedCall(auth, '/api/admin/products', {
      method: 'POST',
      body: FULL_PRODUCT({ slug: 'materials-public-test', status: 'published', materials: ['Blue Aquamarine', 'Rose Quartz'] }),
    });
    expect(created.status).toBe(201);

    const publicView = await call(`/api/products/slug/materials-public-test`);
    expect(publicView.status).toBe(200);
    expect(publicView.json.product.materials).toEqual(['Blue Aquamarine', 'Rose Quartz']);
    // What ProductDetail.jsx actually renders (materials.join(', ')) --
    // confirms it reads as separated names, not a mangled string.
    expect(publicView.json.product.materials.join(', ')).toBe('Blue Aquamarine, Rose Quartz');

    await cleanupProduct(created.json.product.id);
  });
});
