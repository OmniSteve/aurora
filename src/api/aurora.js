// Aurora API layer — the single integration point between the UI and the backend.
// PORTABILITY: to migrate to Cloudflare Workers, replace each implementation below
// with fetch('/api/...') calls. No UI code talks to the backend directly.
import { base44 } from '@/api/base44Client';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const api = {
  products: {
    listPublished: () => base44.entities.Product.filter({ status: 'published' }, '-created_date', 200),
    getBySlug: async (slug) => {
      const r = await base44.entities.Product.filter({ slug });
      return r[0] || null;
    },
    get: (id) => base44.entities.Product.get(id),
    listAll: () => base44.entities.Product.list('-updated_date', 500),
    create: (d) => base44.entities.Product.create(d),
    update: (id, d) => base44.entities.Product.update(id, d),
    remove: (id) => base44.entities.Product.delete(id),
  },
  categories: {
    listPublished: () => base44.entities.Category.filter({ published: true }, 'sort_order'),
    listAll: () => base44.entities.Category.list('sort_order'),
  },
  collections: {
    listPublished: () => base44.entities.Collection.filter({ published: true }),
    listAll: () => base44.entities.Collection.list(),
  },
  orders: {
    create: (d) => base44.entities.Order.create(d),
    get: (id) => base44.entities.Order.get(id),
    listAll: () => base44.entities.Order.list('-created_date', 500),
    update: (id, d) => base44.entities.Order.update(id, d),
  },
  bespoke: {
    create: (d) => base44.entities.BespokeRequest.create(d),
    listAll: () => base44.entities.BespokeRequest.list('-created_date', 500),
    update: (id, d) => base44.entities.BespokeRequest.update(id, d),
  },
  discounts: {
    validate: async (code, subtotal) => {
      const matches = await base44.entities.DiscountCode.filter({ code: (code || '').trim().toUpperCase(), active: true });
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
    markUsed: (d) => base44.entities.DiscountCode.update(d.id, { usage_count: (d.usage_count || 0) + 1 }),
  },
  settings: {
    get: async () => {
      const r = await base44.entities.StoreSettings.list();
      return r[0] || null;
    },
    save: async (data) => {
      const r = await base44.entities.StoreSettings.list();
      if (r[0]) return base44.entities.StoreSettings.update(r[0].id, data);
      return base44.entities.StoreSettings.create(data);
    },
  },
  newsletter: {
    subscribe: (email) => base44.entities.NewsletterSubscriber.create({ email }),
  },
  media: {
    upload: async (file) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return file_url;
    },
  },
  auth: {
    me: () => base44.auth.me(),
    logout: () => base44.auth.logout(),
  },
};