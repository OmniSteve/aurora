import { requireAdminStub } from '../lib/adminGate.js';

// Every admin-gated operation from migration/API_CONTRACT.md is defined
// structurally here (so the real route shape exists and the frontend
// adapter can call it unconditionally) but does nothing except 401 via
// requireAdminStub() until Phase 4 adds real session + role checking.
// Nothing below touches a repository, D1, or R2.
export function registerAdminStubRoutes(router) {
  const stub = async () => requireAdminStub();

  // Products (admin CRUD + single-get, distinct from the public routes in routes/products.js)
  router.get('/api/admin/products', stub);
  router.get('/api/admin/products/:id', stub);
  router.post('/api/admin/products', stub);
  router.put('/api/admin/products/:id', stub);
  router.del('/api/admin/products/:id', stub);

  // Categories / collections admin listing (listPublished is public -- routes/categories.js, routes/collections.js)
  router.get('/api/admin/categories', stub);
  router.get('/api/admin/collections', stub);

  // Orders
  router.get('/api/admin/orders', stub);
  router.put('/api/admin/orders/:id', stub);

  // Bespoke
  router.get('/api/admin/bespoke', stub);
  router.put('/api/admin/bespoke/:id', stub);

  // Discounts admin listing (validate is public -- routes/discounts.js)
  router.get('/api/admin/discounts', stub);

  // Settings mutation (read is public -- routes/settings.js)
  router.put('/api/admin/settings', stub);

  // Newsletter export
  router.get('/api/admin/newsletter', stub);

  // Users
  router.get('/api/admin/users', stub);
}
