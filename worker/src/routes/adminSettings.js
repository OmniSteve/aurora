import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { requireAdmin, requireCsrf } from '../lib/authGuard.js';

const shippingMethodSchema = z.object({
  name: z.string().trim().min(1).max(200),
  price: z.union([z.number(), z.string()]),
  estimate: z.string().max(200).nullable().optional(),
  free_over: z.union([z.number(), z.string()]).nullable().optional(),
});

const settingsSchema = z.object({
  store_name: z.string().max(300).optional(),
  email: z.string().max(320).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  currency: z.string().max(10).optional(),
  currency_symbol: z.string().max(5).optional(),
  tax_rate: z.union([z.number(), z.string()]).optional(),
  prices_include_tax: z.boolean().optional(),
  instagram: z.string().max(500).nullable().optional(),
  facebook: z.string().max(500).nullable().optional(),
  tiktok: z.string().max(500).nullable().optional(),
  shipping_methods: z.array(shippingMethodSchema).max(20).optional(),
  stripe_enabled: z.boolean().optional(),
  stripe_test_mode: z.boolean().optional(),
});

// Full-record admin settings, distinct from the public GET /api/settings
// (routes/settings.js), which deliberately withholds email/phone/address/
// social links/Stripe flags -- the admin Settings page needs all of it.
export function registerAdminSettingsRoutes(router) {
  router.get('/api/admin/settings', async (ctx) => {
    await requireAdmin(ctx);
    return ctx.json({ settings: await ctx.repositories.settings.getAdmin() });
  });

  router.put('/api/admin/settings', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, settingsSchema);
    return ctx.json({ settings: await ctx.repositories.settings.save(data) });
  });
}
