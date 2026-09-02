import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { requireAdmin, requireCsrf } from '../lib/authGuard.js';
import { createRefundForOrder } from '../services/paymentService.js';
import { amountToCents, centsToAmount } from '../lib/money.js';

const refundSchema = z.object({
  amount: z.number().positive().optional(), // GBP pounds; omitted = refund the full amount already paid
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
});

// Backend-only refund capability (instruction: "no polished refund UI") --
// admin-gated, calls Stripe server-side, records the result in
// order_payments. Full or partial; see services/paymentService.js for the
// idempotency-key derivation that keeps a network retry from double-refunding.
export function registerAdminPaymentRoutes(router) {
  router.post('/api/admin/orders/:id/refund', async (ctx) => {
    const { session, user } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);

    const body = await parseJsonBody(ctx.request, refundSchema);
    const result = await createRefundForOrder(ctx, {
      orderId: ctx.params.id,
      amountCents: body.amount != null ? amountToCents(body.amount) : null,
      reason: body.reason,
      adminUserId: user.id,
    });

    return ctx.json({ refund_id: result.refundId, amount: centsToAmount(result.amountCents) });
  });
}
