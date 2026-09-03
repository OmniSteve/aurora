import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { requireAdmin, requireCsrf } from '../lib/authGuard.js';
import { NotFoundError, ValidationError } from '../lib/http.js';
import { amountToCents } from '../lib/money.js';
import { sendEmail, balanceRequestEmail } from '../lib/email.js';

const PROD_STATUSES = ['awaiting_payment', 'awaiting_approval', 'confirmed', 'in_production', 'quality_check', 'ready_to_dispatch', 'dispatched', 'delivered', 'cancelled'];

// payment_status is deliberately NOT part of this schema -- it must only
// ever be produced by real payment/refund processing (payments.js's
// webhook-driven commitPaymentSuccess, paymentService.js's
// createRefundForOrder), never admin-forged through a generic PUT. See
// routes/adminPayments.js for the one legitimate admin-triggered path that
// changes it (a real Stripe refund).
const updateSchema = z.object({
  production_status: z.enum(PROD_STATUSES).optional(),
});

const noteSchema = z.object({ text: z.string().trim().min(1).max(2000) });
const approveSchema = z.object({ amount: z.union([z.number(), z.string()]).optional() });

export function registerAdminOrderRoutes(router) {
  router.get('/api/admin/orders', async (ctx) => {
    await requireAdmin(ctx);
    return ctx.json({ orders: await ctx.repositories.orders.listAllAdmin() });
  });

  router.get('/api/admin/orders/:id', async (ctx) => {
    await requireAdmin(ctx);
    const order = await ctx.repositories.orders.getAdminDetail(ctx.params.id);
    if (!order) throw new NotFoundError('Order not found');
    return ctx.json({ order });
  });

  // Deliberately narrow -- only production_status. Money fields, payment_status
  // and the payments[] timeline are never client-writable here; they only
  // change through services/paymentService.js's Stripe-driven paths
  // (instruction: "update permitted operational fields/statuses").
  router.put('/api/admin/orders/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, updateSchema);
    const existing = await ctx.repositories.orders.getAdminDetail(ctx.params.id);
    if (!existing) throw new NotFoundError('Order not found');
    await ctx.repositories.orders.updateStatus(ctx.params.id, { productionStatus: data.production_status });
    return ctx.json({ order: await ctx.repositories.orders.getAdminDetail(ctx.params.id) });
  });

  router.post('/api/admin/orders/:id/notes', async (ctx) => {
    const { session, user } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const { text } = await parseJsonBody(ctx.request, noteSchema);
    const existing = await ctx.repositories.orders.getAdminDetail(ctx.params.id);
    if (!existing) throw new NotFoundError('Order not found');
    await ctx.repositories.orders.addNote(ctx.params.id, text, user.id);
    return ctx.json({ order: await ctx.repositories.orders.getAdminDetail(ctx.params.id) }, 201);
  });

  // Approving an awaiting-approval order hands it back to the normal
  // payable flow -- services/paymentService.js already refuses a
  // PaymentIntent while requires_approval is set and creates one from
  // order.total_cents once it isn't, so there is no separate "approved
  // order" payment path to build (instruction #5).
  router.post('/api/admin/orders/:id/approve', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const { amount } = await parseJsonBody(ctx.request, approveSchema);
    const existing = await ctx.repositories.orders.getAdminDetail(ctx.params.id);
    if (!existing) throw new NotFoundError('Order not found');
    if (!existing.requires_approval) throw new ValidationError('This order does not require approval.');
    const ok = await ctx.repositories.orders.approve(ctx.params.id, { totalCents: amount != null ? amountToCents(amount) : null });
    if (!ok) throw new ValidationError('This order could not be approved.');
    return ctx.json({ order: await ctx.repositories.orders.getAdminDetail(ctx.params.id) });
  });

  router.post('/api/admin/orders/:id/reject', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const existing = await ctx.repositories.orders.getAdminDetail(ctx.params.id);
    if (!existing) throw new NotFoundError('Order not found');
    if (!existing.requires_approval) throw new ValidationError('This order does not require approval.');
    const ok = await ctx.repositories.orders.reject(ctx.params.id);
    if (!ok) throw new ValidationError('This order could not be rejected.');
    return ctx.json({ order: await ctx.repositories.orders.getAdminDetail(ctx.params.id) });
  });

  // Emails the customer a fresh, working link to pay the remaining balance
  // -- the link carries a newly-minted access token (the original,
  // checkout-time one is never recoverable, only its hash is stored) and
  // the order-confirmation page's existing "Pay Balance" action
  // (worker/src/routes/payments.js) takes it from there. No separate
  // payment portal (instruction #7).
  router.post('/api/admin/orders/:id/request-balance', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const order = await ctx.repositories.orders.getAdminDetail(ctx.params.id);
    if (!order) throw new NotFoundError('Order not found');
    if (order.payment_status !== 'deposit_paid' || order.balance_due <= 0) {
      throw new ValidationError('This order has no outstanding balance to request.');
    }

    const rawOrder = await ctx.repositories.orders.findById(ctx.params.id);
    const payUrl = rawOrder.user_id
      ? `${ctx.env.PUBLIC_ORIGIN}/order-confirmation/${order.id}`
      : `${ctx.env.PUBLIC_ORIGIN}/order-confirmation/${order.id}?token=${await ctx.repositories.orders.rotateAccessToken(order.id)}`;

    await sendEmail(ctx.env, {
      to: order.email,
      ...balanceRequestEmail({ orderNumber: order.order_number, balanceDueCents: amountToCents(order.balance_due), currency: order.currency, payUrl }),
      requestId: ctx.requestId,
    });

    return ctx.json({ sent: true });
  });
}
