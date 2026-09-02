import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { requireAdmin, requireCsrf } from '../lib/authGuard.js';
import { NotFoundError } from '../lib/http.js';

const discountSchema = z.object({
  code: z.string().trim().min(1).max(64),
  type: z.enum(['percentage', 'fixed']).optional(),
  value: z.union([z.number(), z.string()]),
  min_spend: z.union([z.number(), z.string()]).optional(),
  starts_at: z.string().max(50).nullable().optional(),
  ends_at: z.string().max(50).nullable().optional(),
  usage_limit: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
});

export function registerAdminDiscountRoutes(router) {
  router.get('/api/admin/discounts', async (ctx) => {
    await requireAdmin(ctx);
    return ctx.json({ discounts: await ctx.repositories.discounts.listAllAdmin() });
  });

  router.post('/api/admin/discounts', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, discountSchema);
    return ctx.json({ discount: await ctx.repositories.discounts.create(data) }, 201);
  });

  router.put('/api/admin/discounts/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, discountSchema.omit({ code: true }).extend({ code: z.string().max(64).optional() }));
    const existing = await ctx.repositories.discounts.getById(ctx.params.id);
    if (!existing) throw new NotFoundError('Discount code not found');
    return ctx.json({ discount: await ctx.repositories.discounts.update(ctx.params.id, data) });
  });

  // Disables (or, if never used/reserved, deletes) the code -- see
  // repositories/discountsRepository.js for why usage history blocks a
  // hard delete.
  router.del('/api/admin/discounts/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const existing = await ctx.repositories.discounts.getById(ctx.params.id);
    if (!existing) throw new NotFoundError('Discount code not found');
    await ctx.repositories.discounts.remove(ctx.params.id);
    return ctx.json({ deleted: true });
  });
}
