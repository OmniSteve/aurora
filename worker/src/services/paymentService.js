// Stripe payment lifecycle: PaymentIntent creation/reuse, webhook event
// processing, reservation commit/release, the reservation-expiry sweep, and
// refunds. Every money value here is integer pence, straight from D1 or
// straight from Stripe (GBP's minor unit already matches our "cents" scheme
// 1:1, so no conversion is needed at this boundary) -- see lib/money.js for
// where conversion to pounds actually happens (API/UI edges only, never here).
import { createPaymentIntent, retrievePaymentIntent, cancelPaymentIntent, createRefund } from '../lib/stripe.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../lib/http.js';

// PaymentIntent statuses that mean "still open, safe to hand the same
// client_secret back to the browser" -- reusing across a refresh/retry
// instead of creating a second intent for the same attempt (instruction:
// "a browser refresh/network failure must not create another unintended
// PaymentIntent").
const OPEN_INTENT_STATUSES = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture', 'processing']);

// The amount due *right now* for an order that has never had a successful
// payment yet. Mirrors services/checkoutService.js's calculateQuote
// due-now logic, but recomputed from the persisted order row rather than
// trusting the quote (which is display-only and never itself charged) --
// deposit_required_cents, shipping_cost_cents and total_cents are all
// authoritative columns written once at order creation.
export function computeInitialDueNowCents(order) {
  if (order.deposit_required_cents > 0) {
    return Math.min(order.deposit_required_cents + order.shipping_cost_cents, order.total_cents);
  }
  return order.total_cents;
}

// Decides what a POST to the order's payment-intent endpoint should mean
// right now, purely from server-held order state (instruction: "never
// accept an amount from the browser"). Throws for states where no
// PaymentIntent should exist at all.
function nextPaymentIntentPlan(order) {
  if (order.requires_approval) {
    throw new ForbiddenError('This order requires approval before payment can be taken.');
  }
  if (order.payment_status === 'paid' || order.payment_status === 'refunded') {
    throw new ValidationError('This order has already been paid in full.');
  }
  if (order.payment_status === 'deposit_paid' || order.payment_status === 'partially_refunded') {
    if (order.balance_due_cents <= 0) throw new ValidationError('There is no balance remaining on this order.');
    return { purpose: 'balance', amountCents: order.balance_due_cents };
  }
  // pending / processing / failed -- no successful payment recorded yet.
  return { purpose: 'initial', amountCents: computeInitialDueNowCents(order) };
}

// Creates a PaymentIntent for whatever this order currently owes, or hands
// back the client_secret of one already in flight for the same purpose.
// See the module-level idempotency-key comment below for how a dead
// (canceled) intent for the same purpose is safely superseded rather than
// replayed.
export async function createOrRetrievePaymentIntent(ctx, order) {
  const plan = nextPaymentIntentPlan(order);
  const currency = (order.currency || 'GBP').toLowerCase();

  let supersedesIntentId = null;
  if (order.stripe_payment_intent_id) {
    const existing = await retrievePaymentIntent(ctx.env, order.stripe_payment_intent_id);
    const samePurpose = existing.metadata?.payment_purpose === plan.purpose;
    if (samePurpose && (OPEN_INTENT_STATUSES.has(existing.status) || existing.status === 'succeeded')) {
      return { clientSecret: existing.client_secret, amountCents: existing.amount, currency: existing.currency, purpose: plan.purpose, status: existing.status };
    }
    if (samePurpose && existing.status === 'canceled') supersedesIntentId = existing.id;
  }

  // Stable per logical attempt: unchanged across a refresh/retry of the
  // same open intent (that path returns above without ever calling
  // createPaymentIntent again), but guaranteed to change if a prior intent
  // for the same purpose was canceled -- Stripe replays the ORIGINAL
  // response for a reused idempotency key regardless of the resource's
  // current state, so reusing the dead intent's key would hand back the
  // canceled intent forever. Folding its id into the new key sidesteps that.
  const idempotencyKey = supersedesIntentId
    ? `order_${order.id}_${plan.purpose}_after_${supersedesIntentId}`
    : `order_${order.id}_${plan.purpose}_1`;

  const intent = await createPaymentIntent(
    ctx.env,
    { amountCents: plan.amountCents, currency, metadata: { order_id: order.id, order_number: order.order_number, payment_purpose: plan.purpose } },
    idempotencyKey,
  );

  await ctx.repositories.orders.setStripePaymentIntentId(order.id, intent.id);
  if (plan.purpose === 'initial') {
    await ctx.repositories.inventory.linkToPaymentIntent(order.id, intent.id);
    await ctx.repositories.discounts.linkToPaymentIntent(order.id, intent.id);
  }

  return { clientSecret: intent.client_secret, amountCents: intent.amount, currency: intent.currency, purpose: plan.purpose, status: intent.status };
}

function chargeIdFromIntent(intent) {
  const charge = intent.latest_charge;
  if (!charge) return null;
  return typeof charge === 'string' ? charge : charge.id || null;
}

// Applies a succeeded PaymentIntent to Aurora state: records the payment,
// commits whichever reservations backed it (initial purchase only -- a
// balance payment has nothing left to commit, the goods were already
// claimed at initial payment), and updates the order's paid/balance/status
// fields. Idempotent and safe to call more than once for the same intent --
// used by both the webhook handler and the reservation sweep (the sweep
// calls this directly when it finds a succeeded intent still holding an
// active reservation, which is exactly the oversell race this whole design
// exists to close).
export async function commitPaymentSuccess(ctx, intent) {
  const orderId = intent.metadata?.order_id;
  if (!orderId) return { applied: false, reason: 'no_order_id_in_metadata' };

  const order = await ctx.repositories.orders.findById(orderId);
  if (!order) return { applied: false, reason: 'order_not_found' };

  const already = await ctx.repositories.orders.findPaymentBySucceededIntent(intent.id);
  if (already) return { applied: false, reason: 'already_recorded' };

  const purpose = intent.metadata?.payment_purpose === 'balance' ? 'balance' : 'initial';
  const receivedCents = intent.amount_received ?? intent.amount;
  const chargeId = chargeIdFromIntent(intent);
  const paymentId = crypto.randomUUID();
  const statements = [];

  if (purpose === 'initial') {
    for (const row of await ctx.repositories.inventory.findActiveByOrder(orderId)) {
      statements.push(...ctx.repositories.inventory.prepareCommitStatements(row));
    }
    const discountRow = await ctx.repositories.discounts.findActiveByOrder(orderId);
    if (discountRow) statements.push(...ctx.repositories.discounts.prepareCommitStatements(discountRow));

    const balanceDueCents = Math.max(0, order.total_cents - receivedCents);
    statements.push(
      ctx.repositories.orders.prepareInsertPayment({
        id: paymentId,
        orderId,
        type: receivedCents < order.total_cents ? 'deposit' : 'full',
        amountCents: receivedCents,
        status: 'succeeded',
        stripePaymentIntentId: intent.id,
        stripeChargeId: chargeId,
      }),
      ctx.repositories.orders.prepareUpdateOnPaymentSuccess({
        orderId,
        amountPaidCents: receivedCents,
        balanceDueCents,
        paymentStatus: balanceDueCents > 0 ? 'deposit_paid' : 'paid',
        productionStatus: 'confirmed',
      }),
    );
  } else {
    const amountPaidCents = order.amount_paid_cents + receivedCents;
    const balanceDueCents = Math.max(0, order.total_cents - amountPaidCents);
    statements.push(
      ctx.repositories.orders.prepareInsertPayment({
        id: paymentId,
        orderId,
        type: 'balance',
        amountCents: receivedCents,
        status: 'succeeded',
        stripePaymentIntentId: intent.id,
        stripeChargeId: chargeId,
      }),
      ctx.repositories.orders.prepareUpdateOnPaymentSuccess({
        orderId,
        amountPaidCents,
        balanceDueCents,
        paymentStatus: balanceDueCents > 0 ? 'deposit_paid' : 'paid',
        productionStatus: order.production_status,
      }),
    );
  }

  await ctx.env.DB.batch(statements);
  return { applied: true, orderId, purpose };
}

async function recordFailedAttempt(ctx, intent) {
  const orderId = intent.metadata?.order_id;
  if (!orderId) return;
  const order = await ctx.repositories.orders.findById(orderId);
  if (!order) return;

  const purpose = intent.metadata?.payment_purpose === 'balance' ? 'balance' : 'initial';
  await ctx.env.DB.batch([
    ctx.repositories.orders.prepareInsertPayment({
      id: crypto.randomUUID(),
      orderId,
      type: purpose === 'balance' ? 'balance' : intent.amount < order.total_cents ? 'deposit' : 'full',
      amountCents: intent.amount,
      status: 'failed',
      stripePaymentIntentId: intent.id,
    }),
    ctx.repositories.orders.prepareMarkPaymentFailed(orderId),
  ]);
}

// Releases whatever active inventory/discount reservations an order still
// holds. `status` distinguishes why in the audit trail: 'released' for a
// webhook-observed definitive failure/cancellation, 'expired' for the
// sweep's own abandoned-checkout timeout. The CAS `WHERE status = 'active'`
// guard inside each prepared statement (repositories/inventoryRepository.js,
// discountsRepository.js) is what makes this safe to call more than once.
export async function releaseOrderReservations(ctx, orderId, status = 'released') {
  const statements = [];
  for (const row of await ctx.repositories.inventory.findActiveByOrder(orderId)) {
    statements.push(...ctx.repositories.inventory.prepareReleaseStatements(row, status));
  }
  const discountRow = await ctx.repositories.discounts.findActiveByOrder(orderId);
  if (discountRow) statements.push(...ctx.repositories.discounts.prepareReleaseStatements(discountRow, status));
  if (statements.length) await ctx.env.DB.batch(statements);
}

// Dispatches one verified, deduplicated Stripe event. Only the event types
// this endpoint actually needs are handled; anything else is acknowledged
// (200) and ignored -- Stripe's webhook_endpoints resource is configured
// with exactly this event list at deploy time (see routes/webhooks.js).
export async function processStripeEvent(ctx, event) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await commitPaymentSuccess(ctx, event.data.object);
      return;
    case 'payment_intent.payment_failed':
      // Deliberately does NOT release reservations -- Stripe's Payment
      // Element lets the customer retry with a different payment method on
      // the SAME PaymentIntent after a decline, so it is very often still
      // alive. Only a definitive `payment_intent.canceled` (or the sweep's
      // own abandoned-checkout timeout) releases the hold.
      await recordFailedAttempt(ctx, event.data.object);
      return;
    case 'payment_intent.canceled': {
      const orderId = event.data.object.metadata?.order_id;
      if (orderId) await releaseOrderReservations(ctx, orderId, 'released');
      return;
    }
    default:
      return;
  }
}

// Cron-triggered sweep (worker/src/scheduled.js). For every order with an
// expired-but-still-active reservation, checks Stripe (never trusts local
// expiry alone) before releasing -- see worker/migrations/
// 0010_reservation_lifecycle.sql for the oversell race this exists to close.
export async function sweepExpiredReservations(ctx) {
  const nowIso = new Date().toISOString();
  const orderIds = await ctx.repositories.orders.findOrderIdsWithExpiredReservations(nowIso);
  const results = [];
  for (const orderId of orderIds) {
    try {
      results.push(await sweepOrder(ctx, orderId));
    } catch (err) {
      console.error(JSON.stringify({ scope: 'reservation_sweep_order_failed', orderId, error: String(err?.stack || err) }));
      results.push({ orderId, action: 'error' });
    }
  }
  return results;
}

async function sweepOrder(ctx, orderId) {
  const order = await ctx.repositories.orders.findById(orderId);
  if (!order) return { orderId, action: 'order_missing' };

  if (!order.stripe_payment_intent_id) {
    // Checkout never even reached PaymentIntent creation -- there is
    // nothing Stripe can tell us; safe to release outright.
    await releaseOrderReservations(ctx, orderId, 'expired');
    return { orderId, action: 'released_no_intent' };
  }

  const intent = await retrievePaymentIntent(ctx.env, order.stripe_payment_intent_id);

  if (intent.status === 'succeeded') {
    // The webhook is late or never arrived -- commit now. This is the
    // specific case the migration's design note warns about: releasing
    // here instead would let the stock get resold out from under a payment
    // that actually went through.
    await commitPaymentSuccess(ctx, intent);
    return { orderId, action: 'committed_late' };
  }
  if (intent.status === 'processing') {
    // Still resolving (e.g. a slow bank redirect) -- leave the hold in
    // place and re-check on the next sweep run.
    return { orderId, action: 'left_processing' };
  }
  if (intent.status !== 'canceled') {
    // requires_payment_method / requires_confirmation / requires_action /
    // requires_capture -- the customer started but never completed.
    // Cancel the abandoned intent before releasing so it can never later
    // succeed and race a release that already happened.
    try {
      await cancelPaymentIntent(ctx.env, intent.id, `sweep_cancel_${intent.id}`);
    } catch {
      const fresh = await retrievePaymentIntent(ctx.env, order.stripe_payment_intent_id);
      if (fresh.status === 'succeeded') {
        await commitPaymentSuccess(ctx, fresh);
        return { orderId, action: 'committed_late_race' };
      }
      if (fresh.status !== 'canceled') return { orderId, action: 'cancel_failed_left_active' };
    }
  }

  await releaseOrderReservations(ctx, orderId, 'expired');
  return { orderId, action: 'released' };
}

// Admin-gated refund (routes/adminPayments.js). Full or partial, against
// the order's current/most-recent PaymentIntent. `attempt` folds the count
// of already-succeeded refunds on this order into the idempotency key so a
// network retry of the *same* refund request never double-refunds, while a
// genuinely separate subsequent refund still gets its own key.
export async function createRefundForOrder(ctx, { orderId, amountCents, reason, adminUserId }) {
  const order = await ctx.repositories.orders.findById(orderId);
  if (!order) throw new NotFoundError('Order not found.');
  if (!order.stripe_payment_intent_id || order.amount_paid_cents <= 0) {
    throw new ValidationError('This order has no payment to refund.');
  }

  const refundAmountCents = amountCents != null ? amountCents : order.amount_paid_cents;
  if (!Number.isInteger(refundAmountCents) || refundAmountCents <= 0 || refundAmountCents > order.amount_paid_cents) {
    throw new ValidationError('Refund amount must be a whole number of pence, between 1 and the amount already paid.');
  }

  const attempt = await ctx.repositories.orders.countSucceededRefunds(orderId);
  const idempotencyKey = `refund_${orderId}_${refundAmountCents}_${attempt}`;

  const refund = await createRefund(
    ctx.env,
    { paymentIntentId: order.stripe_payment_intent_id, amountCents: refundAmountCents, reason },
    idempotencyKey,
  );

  const remainingPaidCents = order.amount_paid_cents - refundAmountCents;
  await ctx.env.DB.batch([
    ctx.repositories.orders.prepareInsertPayment({
      id: crypto.randomUUID(),
      orderId,
      type: 'refund',
      amountCents: refundAmountCents,
      status: 'succeeded',
      stripePaymentIntentId: order.stripe_payment_intent_id,
      stripeRefundId: refund.id,
      createdBy: adminUserId,
      note: reason || null,
    }),
    ctx.repositories.orders.prepareUpdateOnRefund({
      orderId,
      amountPaidCents: remainingPaidCents,
      paymentStatus: remainingPaidCents <= 0 ? 'refunded' : 'partially_refunded',
    }),
  ]);

  return { refundId: refund.id, amountCents: refundAmountCents };
}
