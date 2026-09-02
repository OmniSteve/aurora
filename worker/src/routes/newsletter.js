import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { enforceRateLimit, getClientIp } from '../lib/rateLimit.js';

const subscribeSchema = z.object({
  email: z.string().trim().email().max(320),
});

export function registerNewsletterRoutes(router) {
  router.post('/api/newsletter/subscribe', async (ctx) => {
    const { email } = await parseJsonBody(ctx.request, subscribeSchema);
    const ip = getClientIp(ctx.request);
    // Keyed by IP, not email -- the abuse pattern here is one source
    // spamming many different addresses, not repeated hits on one address.
    await enforceRateLimit(ctx, {
      action: 'newsletter-subscribe',
      identifier: ip,
      limit: 20,
      windowSeconds: 3600,
      cfBinding: ctx.env.RL_PUBLIC,
      cfKey: ip,
    });
    const subscriber = await ctx.repositories.newsletter.subscribe(email);
    return ctx.json({ subscriber }, 201);
  });
}
