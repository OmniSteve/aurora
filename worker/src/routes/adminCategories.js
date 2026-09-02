import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { requireAdmin, requireCsrf } from '../lib/authGuard.js';
import { NotFoundError } from '../lib/http.js';

const categorySchema = z.object({
  name: z.string().trim().min(1).max(300),
  slug: z.string().trim().max(300).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  image: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().optional(),
  published: z.boolean().optional(),
  seo: z.object({ title: z.string().max(300).nullable().optional(), description: z.string().max(500).nullable().optional() }).nullable().optional(),
});

export function registerAdminCategoryRoutes(router) {
  router.get('/api/admin/categories', async (ctx) => {
    await requireAdmin(ctx);
    return ctx.json({ categories: await ctx.repositories.categories.listAllAdmin() });
  });

  router.post('/api/admin/categories', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, categorySchema);
    return ctx.json({ category: await ctx.repositories.categories.create(data) }, 201);
  });

  router.put('/api/admin/categories/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, categorySchema);
    const existing = await ctx.repositories.categories.getById(ctx.params.id);
    if (!existing) throw new NotFoundError('Category not found');
    return ctx.json({ category: await ctx.repositories.categories.update(ctx.params.id, data) });
  });

  router.del('/api/admin/categories/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const existing = await ctx.repositories.categories.getById(ctx.params.id);
    if (!existing) throw new NotFoundError('Category not found');
    await ctx.repositories.categories.remove(ctx.params.id);
    return ctx.json({ deleted: true });
  });
}
