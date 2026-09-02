import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { requireAdmin, requireCsrf } from '../lib/authGuard.js';
import { NotFoundError } from '../lib/http.js';

const STATUSES = ['new', 'reviewing', 'more_info', 'quote_prepared', 'quote_sent', 'accepted', 'deposit_required', 'in_production', 'ready', 'completed', 'declined'];

const quoteSchema = z.object({
  description: z.string().max(5000).nullable().optional(),
  customisation: z.string().max(2000).nullable().optional(),
  materials: z.string().max(500).nullable().optional(),
  stones: z.string().max(500).nullable().optional(),
  estimated_completion: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  price: z.union([z.number(), z.string()]).nullable().optional(),
  deposit_type: z.enum(['fixed', 'percentage']).nullable().optional(),
  deposit_value: z.union([z.number(), z.string()]).nullable().optional(),
});

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  quote: quoteSchema.optional(),
});

const noteSchema = z.object({ text: z.string().trim().min(1).max(2000) });

export function registerAdminBespokeRoutes(router) {
  router.get('/api/admin/bespoke', async (ctx) => {
    await requireAdmin(ctx);
    return ctx.json({ requests: await ctx.repositories.bespoke.listAllAdmin() });
  });

  router.put('/api/admin/bespoke/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, updateSchema);
    const existing = await ctx.repositories.bespoke.getById(ctx.params.id);
    if (!existing) throw new NotFoundError('Bespoke request not found');
    return ctx.json({ request: await ctx.repositories.bespoke.update(ctx.params.id, data) });
  });

  router.post('/api/admin/bespoke/:id/notes', async (ctx) => {
    const { session, user } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const { text } = await parseJsonBody(ctx.request, noteSchema);
    const existing = await ctx.repositories.bespoke.getById(ctx.params.id);
    if (!existing) throw new NotFoundError('Bespoke request not found');
    await ctx.repositories.bespoke.addNote(ctx.params.id, text, user.id);
    return ctx.json({ request: await ctx.repositories.bespoke.getById(ctx.params.id) }, 201);
  });
}
