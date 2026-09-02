import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';

const subscribeSchema = z.object({
  email: z.string().trim().email().max(320),
});

export function registerNewsletterRoutes(router) {
  router.post('/api/newsletter/subscribe', async (ctx) => {
    const { email } = await parseJsonBody(ctx.request, subscribeSchema);
    const subscriber = await ctx.repositories.newsletter.subscribe(email);
    return ctx.json({ subscriber }, 201);
  });
}
