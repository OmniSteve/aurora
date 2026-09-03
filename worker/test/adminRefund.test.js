import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { call, env, cleanupUser, registerAndVerify, extractAuthCookies } from './helpers.js';
import { seedCategory, seedProduct, seedSettings, cleanupProduct, cleanupOrder } from './commerceHelpers.js';
import { mockStripe } from './stripeHelpers.js';

beforeAll(async () => {
  await seedCategory('cat_test');
  await seedSettings();
});

function idem() {
  return crypto.randomUUID();
}

async function adminSession(email) {
  await cleanupUser(email);
  const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
  await env.DB.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).bind(email).run();
  return extractAuthCookies(cookies);
}

// Bypasses the full Stripe payment flow -- refund logic only depends on the
// order already having stripe_payment_intent_id + amount_paid_cents set,
// which is exactly what a real payment_intent.succeeded webhook leaves
// behind (covered separately in stripeWebhook.test.js).
async function paidOrder({ priceCents = 10000 } = {}) {
  const productId = await seedProduct({ priceCents });
  const { json } = await call('/api/orders', {
    method: 'POST',
    headers: { 'idempotency-key': idem() },
    body: { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' },
  });
  const order = json.order;
  await env.DB
    .prepare(`UPDATE orders SET payment_status = 'paid', amount_paid_cents = ?, balance_due_cents = 0, stripe_payment_intent_id = ? WHERE id = ?`)
    .bind(priceCents, `pi_test_paid_${order.id}`, order.id)
    .run();
  return { order, productId };
}

describe('POST /api/admin/orders/:id/refund', () => {
  let stripe;
  beforeEach(() => { stripe = mockStripe(); });
  afterEach(() => { stripe.restore(); });

  it('anonymous -> 401', async () => {
    const { order } = await paidOrder();
    const { status } = await call(`/api/admin/orders/${order.id}/refund`, { method: 'POST', body: {} });
    expect(status).toBe(401);
    await cleanupOrder(order.id);
  });

  it('authenticated non-admin -> 403', async () => {
    const email = 'refund-non-admin@example.com';
    await cleanupUser(email);
    const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
    const auth = extractAuthCookies(cookies);
    const { order } = await paidOrder();

    const { status } = await call(`/api/admin/orders/${order.id}/refund`, {
      method: 'POST',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
      body: {},
    });
    expect(status).toBe(403);

    await cleanupOrder(order.id);
    await cleanupUser(email);
  });

  it('admin without a valid CSRF token -> 403, no refund attempted', async () => {
    const auth = await adminSession('refund-no-csrf@example.com');
    const { order } = await paidOrder();

    const { status } = await call(`/api/admin/orders/${order.id}/refund`, {
      method: 'POST',
      cookies: { aurora_session: auth.session },
      body: {},
    });
    expect(status).toBe(403);
    expect(stripe.createRefund).not.toHaveBeenCalled();

    await cleanupOrder(order.id);
    await cleanupUser('refund-no-csrf@example.com');
  });

  it('a full refund (no amount given) refunds everything paid and marks the order refunded', async () => {
    const auth = await adminSession('refund-full@example.com');
    const { order } = await paidOrder({ priceCents: 10000 });

    const { status, json } = await call(`/api/admin/orders/${order.id}/refund`, {
      method: 'POST',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
      body: {},
    });
    expect(status).toBe(200);
    expect(json.amount).toBe(100);
    expect(stripe.createRefund).toHaveBeenCalledTimes(1);

    const dbOrder = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('refunded');
    expect(dbOrder.amount_paid_cents).toBe(0);

    const payment = await env.DB.prepare(`SELECT * FROM order_payments WHERE order_id = ? AND type = 'refund'`).bind(order.id).first();
    expect(payment.status).toBe('succeeded');
    expect(payment.amount_cents).toBe(10000);
    expect(payment.created_by).toBeTruthy();

    await cleanupOrder(order.id);
    await cleanupUser('refund-full@example.com');
  });

  it('a partial refund leaves the order partially_refunded with a reduced amount_paid', async () => {
    const auth = await adminSession('refund-partial@example.com');
    const { order } = await paidOrder({ priceCents: 10000 });

    const { status, json } = await call(`/api/admin/orders/${order.id}/refund`, {
      method: 'POST',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
      body: { amount: 30 }, // £30 of £100
    });
    expect(status).toBe(200);
    expect(json.amount).toBe(30);

    const dbOrder = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('partially_refunded');
    expect(dbOrder.amount_paid_cents).toBe(7000);

    await cleanupOrder(order.id);
    await cleanupUser('refund-partial@example.com');
  });

  it('refusing to refund more than was actually paid', async () => {
    const auth = await adminSession('refund-too-much@example.com');
    const { order } = await paidOrder({ priceCents: 10000 });

    const { status, json } = await call(`/api/admin/orders/${order.id}/refund`, {
      method: 'POST',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
      body: { amount: 500 }, // £500 > £100 paid
    });
    expect(status).toBe(400);
    expect(json.error).toBe('validation_error');
    expect(stripe.createRefund).not.toHaveBeenCalled();

    await cleanupOrder(order.id);
    await cleanupUser('refund-too-much@example.com');
  });

  it('a duplicate refund attempt after a successful full refund cannot issue twice', async () => {
    const auth = await adminSession('refund-duplicate@example.com');
    const { order } = await paidOrder({ priceCents: 10000 });
    const authed = {
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
    };

    const first = await call(`/api/admin/orders/${order.id}/refund`, { method: 'POST', ...authed, body: {} });
    expect(first.status).toBe(200);

    // Same order, same "refund everything" request, immediately after --
    // the realistic double-click/retry scenario.
    const second = await call(`/api/admin/orders/${order.id}/refund`, { method: 'POST', ...authed, body: {} });
    expect(second.status).toBe(400);
    expect(second.json.error).toBe('validation_error');

    expect(stripe.createRefund).toHaveBeenCalledTimes(1);

    const dbOrder = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('refunded');
    expect(dbOrder.amount_paid_cents).toBe(0);

    const payments = await env.DB.prepare(`SELECT * FROM order_payments WHERE order_id = ? AND type = 'refund'`).bind(order.id).all();
    expect(payments.results).toHaveLength(1);

    await cleanupOrder(order.id);
    await cleanupUser('refund-duplicate@example.com');
  });

  it('a failed Stripe refund leaves the order and ledger unchanged', async () => {
    const auth = await adminSession('refund-stripe-fails@example.com');
    const { order } = await paidOrder({ priceCents: 10000 });

    stripe.createRefund.mockRejectedValueOnce(new Error('Stripe: refund failed (simulated)'));

    const { status } = await call(`/api/admin/orders/${order.id}/refund`, {
      method: 'POST',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
      body: {},
    });
    expect(status).toBeGreaterThanOrEqual(400);

    const dbOrder = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('paid');
    expect(dbOrder.amount_paid_cents).toBe(10000);

    const payments = await env.DB.prepare(`SELECT * FROM order_payments WHERE order_id = ? AND type = 'refund'`).bind(order.id).all();
    expect(payments.results).toHaveLength(0);

    await cleanupOrder(order.id);
    await cleanupUser('refund-stripe-fails@example.com');
  });
});

describe('PUT /api/admin/orders/:id cannot forge payment_status', () => {
  it('payment_status in the request body is silently ignored -- only production_status is settable', async () => {
    const auth = await adminSession('forge-payment-status@example.com');
    const { order } = await paidOrder({ priceCents: 10000 });

    const { status, json } = await call(`/api/admin/orders/${order.id}`, {
      method: 'PUT',
      cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf },
      headers: { 'x-csrf-token': auth.csrf },
      body: { payment_status: 'refunded', production_status: 'in_production' },
    });
    expect(status).toBe(200);
    // production_status, a legitimately admin-editable field, still applies...
    expect(json.order.production_status).toBe('in_production');
    // ...but payment_status is untouched by this endpoint no matter what's sent.
    expect(json.order.payment_status).toBe('paid');

    const dbOrder = await env.DB.prepare(`SELECT payment_status, amount_paid_cents FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('paid');
    expect(dbOrder.amount_paid_cents).toBe(10000);

    await cleanupOrder(order.id);
    await cleanupUser('forge-payment-status@example.com');
  });
});
