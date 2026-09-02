import { requireAdmin } from '../lib/authGuard.js';
import { NotImplementedError } from '../lib/http.js';

// Every admin-gated operation from migration/API_CONTRACT.md is defined
// structurally here so the real route shape exists and the frontend
// adapter can call it unconditionally, but the CRUD logic itself is still
// 501 -- Phase 4's job is the security boundary (requireAdmin: 401
// anonymous / 403 wrong role / passes through for a real admin), not the
// unrelated catalogue/order/settings CRUD behind it. That's explicitly
// acceptable per the Phase 4 brief.
export function registerAdminStubRoutes(router) {
  const stub = async (ctx) => {
    await requireAdmin(ctx);
    throw new NotImplementedError('Not implemented yet.');
  };

  router.get('/api/admin/products', stub);
  router.get('/api/admin/products/:id', stub);
  router.post('/api/admin/products', stub);
  router.put('/api/admin/products/:id', stub);
  router.del('/api/admin/products/:id', stub);

  router.get('/api/admin/categories', stub);
  router.get('/api/admin/collections', stub);

  router.get('/api/admin/orders', stub);
  router.put('/api/admin/orders/:id', stub);

  router.get('/api/admin/bespoke', stub);
  router.put('/api/admin/bespoke/:id', stub);

  router.get('/api/admin/discounts', stub);

  router.put('/api/admin/settings', stub);

  router.get('/api/admin/newsletter', stub);

  router.get('/api/admin/users', stub);
}
