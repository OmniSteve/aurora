import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { evaluateDiscount } from '../services/discountService.js';

const validateSchema = z.object({
  code: z.string().trim().min(1).max(64),
  subtotal: z.number().nonnegative(),
});

export function registerDiscountRoutes(router) {
  // Read-only and advisory -- see services/discountService.js. Does not
  // touch usage_count/reserved_count. There is no markUsed route: Phase 6
  // redesigns redemption around the reservation tables in
  // worker/migrations/0004_discounts.sql, so a stub here would document a
  // shape that's about to change rather than one that's merely gated.
  router.post('/api/discounts/validate', async (ctx) => {
    const { code, subtotal } = await parseJsonBody(ctx.request, validateSchema);
    const result = await evaluateDiscount({ discountsRepository: ctx.repositories.discounts, code, subtotal });
    return ctx.json(result);
  });
}
