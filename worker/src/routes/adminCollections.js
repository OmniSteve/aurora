import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { requireAdmin, requireCsrf } from '../lib/authGuard.js';
import { NotFoundError } from '../lib/http.js';

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(300),
  slug: z.string().trim().max(300).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  hero_image: z.string().max(2000).nullable().optional(),
  published: z.boolean().optional(),
  featured: z.boolean().optional(),
  seo: z.object({ title: z.string().max(300).nullable().optional(), description: z.string().max(500).nullable().optional() }).nullable().optional(),
});

export function registerAdminCollectionRoutes(router) {
  router.get('/api/admin/collections', async (ctx) => {
    await requireAdmin(ctx);
    return ctx.json({ collections: await ctx.repositories.collections.listAllAdmin() });
  });

  router.post('/api/admin/collections', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, collectionSchema);
    return ctx.json({ collection: await ctx.repositories.collections.create(data) }, 201);
  });

  router.put('/api/admin/collections/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, collectionSchema);
    const existing = await ctx.repositories.collections.getById(ctx.params.id);
    if (!existing) throw new NotFoundError('Collection not found');
    return ctx.json({ collection: await ctx.repositories.collections.update(ctx.params.id, data) });
  });

  router.del('/api/admin/collections/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const existing = await ctx.repositories.collections.getById(ctx.params.id);
    if (!existing) throw new NotFoundError('Collection not found');
    await ctx.repositories.collections.remove(ctx.params.id);
    return ctx.json({ deleted: true });
  });
}
