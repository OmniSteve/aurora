import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { enforceRateLimit, getClientIp } from '../lib/rateLimit.js';
import { sendEmail, bespokeAcknowledgementEmail } from '../lib/email.js';

const bespokeSchema = z.object({
  customer_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().max(50).optional(),
  jewellery_type: z.string().max(100).optional(),
  description: z.string().max(5000).optional(),
  inspiration: z.string().max(5000).optional(),
  materials: z.string().max(500).optional(),
  stones: z.string().max(500).optional(),
  approximate_size: z.string().max(200).optional(),
  budget: z.string().max(200).optional(),
  completion_date: z.string().max(50).optional(),
  reference_images: z.array(z.string().max(2000)).max(5).optional(),
  notes: z.string().max(5000).optional(),
});

export function registerBespokeRoutes(router) {
  router.post('/api/bespoke', async (ctx) => {
    const data = await parseJsonBody(ctx.request, bespokeSchema);
    const ip = getClientIp(ctx.request);
    await enforceRateLimit(ctx, {
      action: 'bespoke-create',
      identifier: ip,
      limit: 10,
      windowSeconds: 3600,
      cfBinding: ctx.env.RL_PUBLIC,
      cfKey: ip,
    });

    const request = await ctx.repositories.bespoke.create(data);

    await sendEmail(ctx.env, {
      to: data.email,
      ...bespokeAcknowledgementEmail({ customerName: data.customer_name }),
      requestId: ctx.requestId,
    });

    return ctx.json({ request }, 201);
  });
}
