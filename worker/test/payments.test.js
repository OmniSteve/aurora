import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { call, env } from './helpers.js';
import { seedCategory, seedProduct, seedSettings, cleanupProduct, cleanupOrder } from './commerceHelpers.js';
import { mockStripe } from './stripeHelpers.js';

beforeAll(async () => {
  await seedCategory('cat_test');
  await seedSettings();
});

function idem() {
  return crypto.randomUUID();
}

async function placeOrder({ priceCents = 10000, requiresApproval = false } = {}) {
  const productId = await seedProduct({ priceCents });
  if (requiresApproval) {
    const { seedSpecialRequest } = await import('./commerceHelpers.js');
    await seedSpecialRequest(productId, { enabled: true, paymentBehaviour: 'approval' });
  }
  const { json } = await call('/api/orders', {
    method: 'POST',
    headers: { 'idempotency-key': idem() },
    body: {
      items: requiresApproval
        ? [{ product_id: productId, quantity: 1, special_request: { text: 'special' } }]
        : [{ product_id: productId, quantity: 1 }],
      email: 'buyer@example.com',
    },
  });
  return { order: json.order, accessToken: json.accessToken, productId };
}

describe('POST /api/orders/:id/payment-intent', () => {
  let stripe;
  beforeEach(() => { stripe = mockStripe(); });
  afterEach(() => { stripe.restore(); });

  it('creates a PaymentIntent for the server-computed due-now amount, never a client-supplied one', async () => {
    const { order, accessToken } = await placeOrder({ priceCents: 10000 });
    const { status, json } = await call(`/api/orders/${order.id}/payment-intent?token=${accessToken}`, {
      method: 'POST',
      body: { amount: 1 }, // ignored -- amount is never accepted from the client
    });
    expect(status).toBe(200);
    expect(json.amount).toBe(order.total); // no deposit configured -- full total due now
    expect(json.purpose).toBe('initial');
    expect(json.client_secret).toBeTruthy();
    expect(stripe.createPaymentIntent).toHaveBeenCalledTimes(1);
    const callArgs = stripe.createPaymentIntent.mock.calls[0][1];
    expect(callArgs.metadata.order_id).toBe(order.id);
    expect(callArgs.metadata.payment_purpose).toBe('initial');
    // No unnecessary customer PII in metadata.
    expect(callArgs.metadata.email).toBeUndefined();

    await cleanupOrder(order.id);
  });

  it('refuses to create a PaymentIntent for an order requiring approval', async () => {
    const { order, accessToken } = await placeOrder({ requiresApproval: true });
    const { status, json } = await call(`/api/orders/${order.id}/payment-intent?token=${accessToken}`, { method: 'POST' });
    expect(status).toBe(403);
    expect(json.error).toBe('forbidden');
    expect(stripe.createPaymentIntent).not.toHaveBeenCalled();

    await cleanupOrder(order.id);
  });

  it('a second call while the intent is still open reuses it instead of creating another', async () => {
    const { order, accessToken } = await placeOrder();
    const first = await call(`/api/orders/${order.id}/payment-intent?token=${accessToken}`, { method: 'POST' });
    const second = await call(`/api/orders/${order.id}/payment-intent?token=${accessToken}`, { method: 'POST' });

    expect(first.json.client_secret).toBe(second.json.client_secret);
    expect(stripe.createPaymentIntent).toHaveBeenCalledTimes(1); // only the first call actually created one

    await cleanupOrder(order.id);
  });

  it('a canceled intent is superseded by a genuinely new one, not replayed', async () => {
    const { order, accessToken } = await placeOrder();
    const first = await call(`/api/orders/${order.id}/payment-intent?token=${accessToken}`, { method: 'POST' });
    const firstIntentId = (await env.DB.prepare(`SELECT stripe_payment_intent_id FROM orders WHERE id = ?`).bind(order.id).first()).stripe_payment_intent_id;
    stripe.setStatus(firstIntentId, 'canceled');

    const second = await call(`/api/orders/${order.id}/payment-intent?token=${accessToken}`, { method: 'POST' });
    expect(second.json.client_secret).not.toBe(first.json.client_secret);
    expect(stripe.createPaymentIntent).toHaveBeenCalledTimes(2);

    await cleanupOrder(order.id);
  });

  it('the order id alone (no token, no session) cannot be used to start payment', async () => {
    const { order } = await placeOrder();
    const { status } = await call(`/api/orders/${order.id}/payment-intent`, { method: 'POST' });
    expect(status).toBe(404);
    await cleanupOrder(order.id);
  });

  it('an order that is already fully paid refuses a new PaymentIntent', async () => {
    const { order, accessToken } = await placeOrder();
    await env.DB.prepare(`UPDATE orders SET payment_status = 'paid', balance_due_cents = 0 WHERE id = ?`).bind(order.id).run();
    const { status, json } = await call(`/api/orders/${order.id}/payment-intent?token=${accessToken}`, { method: 'POST' });
    expect(status).toBe(400);
    expect(json.error).toBe('validation_error');
    await cleanupOrder(order.id);
  });
});
