import { requireAdmin } from '../lib/authGuard.js';

export function registerAdminNewsletterRoutes(router) {
  router.get('/api/admin/newsletter', async (ctx) => {
    await requireAdmin(ctx);
    return ctx.json({ subscribers: await ctx.repositories.newsletter.listAll() });
  });
}
