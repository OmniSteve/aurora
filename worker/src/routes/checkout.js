import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { calculateQuote, quoteToDisplay } from '../services/checkoutService.js';
import { enforceRateLimit, getClientIp } from '../lib/rateLimit.js';

const itemSchema = z.object({
  product_id: z.string().min(1),
  quantity: z.number().int().min(1).max(100),
  options: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  customizations: z.record(z.union([z.string(), z.number()])).optional(),
  special_request: z
    .object({ text: z.string().max(2000).optional(), images: z.array(z.string().max(2000)).max(10).optional() })
    .optional(),
});

export const quoteSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  shipping_method: z.string().max(200).optional(),
  discount_code: z.string().max(64).optional(),
});

export function registerCheckoutRoutes(router) {
  // Read-only, no side effects -- never reserves inventory or a discount
  // slot. A preview only; order creation recalculates everything from
  // scratch and does not trust this response as input (instruction #2).
  router.post('/api/checkout/quote', async (ctx) => {
    const body = await parseJsonBody(ctx.request, quoteSchema);
    const ip = getClientIp(ctx.request);
    await enforceRateLimit(ctx, {
      action: 'checkout-quote',
      identifier: ip,
      limit: 60,
      windowSeconds: 60,
      cfBinding: ctx.env.RL_PUBLIC,
      cfKey: ip,
    });
    const quote = await calculateQuote(ctx, body);
    return ctx.json(quoteToDisplay(quote));
  });
}
