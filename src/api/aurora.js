// Aurora API layer — the single integration point between the UI and the backend.
// ---------------------------------------------------------------------------
//   React UI  →  api.* (this file) + auth (src/api/auth.js)  →  backend adapter
//
// No page or component may import the backend adapter or any vendor SDK.
// To migrate: implement src/api/backend/<newBackend>.js with the same `backend`
// shape and change the import below. See migration/API_CONTRACT.md.
// ---------------------------------------------------------------------------
import { backend } from '@/api/backend/base44';
import { auth } from '@/api/auth';

const db = backend.collections;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const api = {
  products: {
    listPublished: () => db.products.filter({ status: 'published' }, '-created_date', 200),
    getBySlug: async (slug) => {
      const r = await db.products.filter({ slug });
      return r[0] || null;
    },
    get: (id) => db.products.get(id),
    listAll: () => db.products.list('-updated_date', 500),
    create: (d) => db.products.create(d),
    update: (id, d) => db.products.update(id, d),
    remove: (id) => db.products.remove(id),
  },
  categories: {
    listPublished: () => db.categories.filter({ published: true }, 'sort_order'),
    listAll: () => db.categories.list('sort_order'),
  },
  collections: {
    listPublished: () => db.collections.filter({ published: true }),
    listAll: () => db.collections.list(),
  },
  orders: {
    create: (d) => db.orders.create(d),
    get: (id) => db.orders.get(id),
    listAll: () => db.orders.list('-created_date', 500),
    update: (id, d) => db.orders.update(id, d),
  },
  bespoke: {
    create: (d) => db.bespokeRequests.create(d),
    listAll: () => db.bespokeRequests.list('-created_date', 500),
    update: (id, d) => db.bespokeRequests.update(id, d),
  },
  discounts: {
    listAll: () => db.discountCodes.list('-created_date', 500),
    // NOTE: validation currently runs client-side. See migration/SERVER_REQUIREMENTS.md.
    validate: async (code, subtotal) => {
      const matches = await db.discountCodes.filter({ code: (code || '').trim().toUpperCase(), active: true });
      const d = matches[0];
      if (!d) return { valid: false, reason: 'Invalid discount code' };
      const now = new Date();
      if (d.starts_at && new Date(d.starts_at) > now) return { valid: false, reason: 'This code is not active yet' };
      if (d.ends_at && new Date(d.ends_at) < now) return { valid: false, reason: 'This code has expired' };
      if (d.usage_limit && (d.usage_count || 0) >= d.usage_limit) return { valid: false, reason: 'This code has reached its usage limit' };
      if (d.min_spend && subtotal < d.min_spend) return { valid: false, reason: `Minimum spend of £${d.min_spend} required` };
      const amount = d.type === 'percentage' ? (subtotal * d.value) / 100 : Math.min(d.value, subtotal);
      return { valid: true, record: d, amount: r2(amount) };
    },
    markUsed: (d) => db.discountCodes.update(d.id, { usage_count: (d.usage_count || 0) + 1 }),
  },
  settings: {
    get: async () => {
      const r = await db.storeSettings.list();
      return r[0] || null;
    },
    save: async (data) => {
      const r = await db.storeSettings.list();
      if (r[0]) return db.storeSettings.update(r[0].id, data);
      return db.storeSettings.create(data);
    },
  },
  newsletter: {
    subscribe: (email) => db.newsletterSubscribers.create({ email }),
    listAll: () => db.newsletterSubscribers.list('-created_date', 1000),
  },
  users: {
    // Admin only. Returns safe profile fields; never credentials.
    listAll: async () => {
      const rows = await db.users.list();
      return rows.map(({ id, email, full_name, role, created_date }) => ({ id, email, full_name, role, created_date }));
    },
  },
  media: {
    upload: (file) => backend.media.upload(file),
  },
  auth,
};