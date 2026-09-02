import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { call, env } from './helpers.js';
import { seedCategory, seedProduct, seedDeposit, seedSettings, cleanupProduct, cleanupOrder, getProduct } from './commerceHelpers.js';
import { mockStripe, signedWebhookPayload } from './stripeHelpers.js';

const WEBHOOK_SECRET = () => env.STRIPE_WEBHOOK_SECRET;

beforeAll(async () => {
  await seedCategory('cat_test');
  await seedSettings();
});

function idem() {
  return crypto.randomUUID();
}

async function cleanupEvent(id) {
  await env.DB.prepare(`DELETE FROM stripe_events WHERE id = ?`).bind(id).run();
}

async function placeOrderWithIntent({ priceCents = 10000, deposit } = {}) {
  const productId = await seedProduct({ priceCents, stockQuantity: 10 });
  if (deposit) await seedDeposit(productId, deposit);
  const { json: orderJson } = await call('/api/orders', {
    method: 'POST',
    headers: { 'idempotency-key': idem() },
    body: { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' },
  });
  const order = orderJson.order;
  await call(`/api/orders/${order.id}/payment-intent?token=${orderJson.accessToken}`, { method: 'POST' });
  const row = await env.DB.prepare(`SELECT stripe_payment_intent_id FROM orders WHERE id = ?`).bind(order.id).first();
  return { order, productId, accessToken: orderJson.accessToken, intentId: row.stripe_payment_intent_id };
}

// helpers.js's call()/makeRequest() always JSON.stringifies `body`; the
// webhook needs the exact previously-signed bytes, so this constructs the
// Request directly rather than going through call().
async function postRawWebhook(rawBody, header) {
  const worker = (await import('../src/index.js')).default;
  const response = await worker.fetch(
    new Request('https://example.com/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': header, 'content-type': 'application/json', 'cf-connecting-ip': crypto.randomUUID() },
      body: rawBody,
    }),
    env,
  );
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

describe('POST /api/webhooks/stripe', () => {
  let stripe;
  beforeEach(() => { stripe = mockStripe(); });
  afterEach(() => { stripe.restore(); });

  it('rejects a missing signature', async () => {
    const { status, json } = await postRawWebhook(JSON.stringify({ id: 'evt_x', type: 'payment_intent.succeeded', data: { object: {} } }), '');
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_signature');
  });

  it('rejects an invalid signature', async () => {
    const { status } = await postRawWebhook(JSON.stringify({ id: 'evt_x', type: 'payment_intent.succeeded', data: { object: {} } }), 't=1,v1=deadbeef');
    expect(status).toBe(400);
  });

  it('payment_intent.succeeded (full payment, no deposit): commits inventory, records the payment, confirms the order', async () => {
    const { order, productId, intentId } = await placeOrderWithIntent({ priceCents: 10000 });
    stripe.setStatus(intentId, 'succeeded');
    const intent = stripe.getIntent(intentId);
    const { rawBody, header, event } = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.succeeded', data: intent });

    const { status, json } = await postRawWebhook(rawBody, header);
    expect(status).toBe(200);
    expect(json.received).toBe(true);

    const dbOrder = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('paid');
    expect(dbOrder.production_status).toBe('confirmed');
    expect(dbOrder.amount_paid_cents).toBe(intent.amount);
    expect(dbOrder.balance_due_cents).toBe(0);

    const product = await getProduct(productId);
    expect(product.stock_quantity).toBe(9); // decremented
    expect(product.reserved_quantity).toBe(0); // released back down

    const reservation = await env.DB.prepare(`SELECT status FROM inventory_reservations WHERE order_id = ?`).bind(order.id).first();
    expect(reservation.status).toBe('committed');

    const payments = await env.DB.prepare(`SELECT * FROM order_payments WHERE order_id = ?`).bind(order.id).all();
    expect(payments.results.length).toBe(1);
    expect(payments.results[0].type).toBe('full');
    expect(payments.results[0].status).toBe('succeeded');

    await cleanupEvent(event.id);
    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });

  it('a duplicate delivery of the same event id never double-applies the payment', async () => {
    const { order, productId, intentId } = await placeOrderWithIntent({ priceCents: 10000 });
    stripe.setStatus(intentId, 'succeeded');
    const intent = stripe.getIntent(intentId);
    const { rawBody, header, event } = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.succeeded', data: intent, id: 'evt_dup_test' });

    const first = await postRawWebhook(rawBody, header);
    const second = await postRawWebhook(rawBody, header);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.json.duplicate).toBe(true);

    const product = await getProduct(productId);
    expect(product.stock_quantity).toBe(9); // decremented exactly once, not twice

    const payments = await env.DB.prepare(`SELECT COUNT(*) AS n FROM order_payments WHERE order_id = ?`).bind(order.id).first();
    expect(payments.n).toBe(1);

    await cleanupEvent(event.id);
    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });

  it('payment_intent.payment_failed records the failure but does not release the reservation', async () => {
    const { order, productId, intentId } = await placeOrderWithIntent({ priceCents: 10000 });
    const intent = stripe.getIntent(intentId);
    const { rawBody, header, event } = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.payment_failed', data: intent });

    const { status } = await postRawWebhook(rawBody, header);
    expect(status).toBe(200);

    const dbOrder = await env.DB.prepare(`SELECT payment_status FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('failed');

    const reservation = await env.DB.prepare(`SELECT status FROM inventory_reservations WHERE order_id = ?`).bind(order.id).first();
    expect(reservation.status).toBe('active'); // still held -- the customer can retry the same intent

    const product = await getProduct(productId);
    expect(product.stock_quantity).toBe(10); // untouched

    await cleanupEvent(event.id);
    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });

  it('payment_intent.canceled releases the reservation without touching stock_quantity', async () => {
    const { order, productId, intentId } = await placeOrderWithIntent({ priceCents: 10000 });
    stripe.setStatus(intentId, 'canceled');
    const intent = stripe.getIntent(intentId);
    const { rawBody, header, event } = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.canceled', data: intent });

    const { status } = await postRawWebhook(rawBody, header);
    expect(status).toBe(200);

    const reservation = await env.DB.prepare(`SELECT status FROM inventory_reservations WHERE order_id = ?`).bind(order.id).first();
    expect(reservation.status).toBe('released');

    const product = await getProduct(productId);
    expect(product.stock_quantity).toBe(10);
    expect(product.reserved_quantity).toBe(0);

    await cleanupEvent(event.id);
    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });

  it('a deposit payment moves the order to deposit_paid with a positive balance_due, not paid', async () => {
    const { order, intentId } = await placeOrderWithIntent({ priceCents: 10000, deposit: { enabled: true, type: 'percentage', value: 30 } });
    stripe.setStatus(intentId, 'succeeded');
    const intent = stripe.getIntent(intentId);
    expect(intent.amount).toBe(3000); // 30% of £100

    const { rawBody, header, event } = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.succeeded', data: intent });
    await postRawWebhook(rawBody, header);

    const dbOrder = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('deposit_paid');
    expect(dbOrder.balance_due_cents).toBe(7000);
    expect(dbOrder.production_status).toBe('confirmed');

    const payment = await env.DB.prepare(`SELECT type FROM order_payments WHERE order_id = ?`).bind(order.id).first();
    expect(payment.type).toBe('deposit');

    await cleanupEvent(event.id);
    await cleanupOrder(order.id);
  });

  it('a full deposit -> balance lifecycle ends with the order paid and both payments recorded', async () => {
    const { order, productId, accessToken, intentId: initialIntentId } = await placeOrderWithIntent({
      priceCents: 10000,
      deposit: { enabled: true, type: 'percentage', value: 30 },
    });

    // Initial (deposit) payment succeeds.
    stripe.setStatus(initialIntentId, 'succeeded');
    const first = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.succeeded', data: stripe.getIntent(initialIntentId) });
    await postRawWebhook(first.rawBody, first.header);

    let dbOrder = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('deposit_paid');
    expect(dbOrder.balance_due_cents).toBe(7000);

    // Customer comes back later to pay the remaining balance -- a brand new
    // PaymentIntent, not a reuse of the earlier (succeeded, different-purpose) one.
    const { status, json: balanceIntentJson } = await call(`/api/orders/${order.id}/payment-intent?token=${accessToken}`, { method: 'POST' });
    expect(status).toBe(200);
    expect(balanceIntentJson.purpose).toBe('balance');
    expect(balanceIntentJson.amount).toBe(70); // £70 remaining
    const balanceIntentId = (await env.DB.prepare(`SELECT stripe_payment_intent_id FROM orders WHERE id = ?`).bind(order.id).first()).stripe_payment_intent_id;
    expect(balanceIntentId).not.toBe(initialIntentId);

    stripe.setStatus(balanceIntentId, 'succeeded');
    const second = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.succeeded', data: stripe.getIntent(balanceIntentId) });
    await postRawWebhook(second.rawBody, second.header);

    dbOrder = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('paid');
    expect(dbOrder.balance_due_cents).toBe(0);
    expect(dbOrder.amount_paid_cents).toBe(10000);

    const payments = await env.DB.prepare(`SELECT type FROM order_payments WHERE order_id = ? ORDER BY created_at`).bind(order.id).all();
    expect(payments.results.map((p) => p.type)).toEqual(['deposit', 'balance']);

    // The balance payment must not have re-committed inventory a second time.
    const product = await env.DB.prepare(`SELECT stock_quantity FROM products WHERE id = ?`).bind(productId).first();
    expect(product.stock_quantity).toBe(9); // decremented once, at the initial payment

    await cleanupEvent(first.event.id);
    await cleanupEvent(second.event.id);
    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });
});
