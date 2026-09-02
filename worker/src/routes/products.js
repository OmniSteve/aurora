import { NotFoundError } from '../lib/http.js';

export function registerProductRoutes(router) {
  router.get('/api/products', async (ctx) => {
    const products = await ctx.repositories.products.listPublished();
    return ctx.json({ products });
  });

  // status = 'published' is enforced inside the repository query itself, so
  // a draft/archived product 404s even if the caller already knows its slug.
  router.get('/api/products/slug/:slug', async (ctx) => {
    const product = await ctx.repositories.products.getPublishedBySlug(ctx.params.slug);
    if (!product) throw new NotFoundError('Product not found');
    return ctx.json({ product });
  });
}
