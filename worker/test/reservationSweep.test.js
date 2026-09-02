import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { call, env } from './helpers.js';
import { seedCategory, seedProduct, seedSettings, cleanupProduct, cleanupOrder, getProduct } from './commerceHelpers.js';
import { mockStripe } from './stripeHelpers.js';
import { runScheduledSweep } from '../src/scheduled.js';

beforeAll(async () => {
  await seedCategory('cat_test');
  await seedSettings();
});

function idem() {
  return crypto.randomUUID();
}

const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

async function placeOrder({ priceCents = 10000, withIntent = false } = {}) {
  const productId = await seedProduct({ priceCents, stockQuantity: 10 });
  const { json } = await call('/api/orders', {
    method: 'POST',
    headers: { 'idempotency-key': idem() },
    body: { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' },
  });
  const order = json.order;
  let intentId = null;
  if (withIntent) {
    await call(`/api/orders/${order.id}/payment-intent?token=${json.accessToken}`, { method: 'POST' });
    intentId = (await env.DB.prepare(`SELECT stripe_payment_intent_id FROM orders WHERE id = ?`).bind(order.id).first()).stripe_payment_intent_id;
  }
  await env.DB.prepare(`UPDATE inventory_reservations SET expires_at = ? WHERE order_id = ?`).bind(PAST, order.id).run();
  return { order, productId, accessToken: json.accessToken, intentId };
}

describe('reservation-expiry sweep', () => {
  let stripe;
  beforeEach(() => { stripe = mockStripe(); });
  afterEach(() => { stripe.restore(); });

  it('releases an expired reservation that never reached PaymentIntent creation', async () => {
    const { order, productId } = await placeOrder({ withIntent: false });
    await runScheduledSweep(env);

    const reservation = await env.DB.prepare(`SELECT status FROM inventory_reservations WHERE order_id = ?`).bind(order.id).first();
    expect(reservation.status).toBe('expired');
    const product = await getProduct(productId);
    expect(product.reserved_quantity).toBe(0);
    expect(product.stock_quantity).toBe(10);
    expect(stripe.retrievePaymentIntent).not.toHaveBeenCalled();

    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });

  it('cancels an abandoned-but-still-open PaymentIntent before releasing', async () => {
    const { order, productId, intentId } = await placeOrder({ withIntent: true });
    // stays at the mock's default 'requires_payment_method' -- customer
    // started checkout but never completed it.
    await runScheduledSweep(env);

    expect(stripe.cancelPaymentIntent).toHaveBeenCalledWith(expect.anything(), intentId, expect.any(String));
    const reservation = await env.DB.prepare(`SELECT status FROM inventory_reservations WHERE order_id = ?`).bind(order.id).first();
    expect(reservation.status).toBe('expired');
    const product = await getProduct(productId);
    expect(product.reserved_quantity).toBe(0);

    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });

  it('never releases -- instead commits -- a reservation whose PaymentIntent actually succeeded (the oversell race)', async () => {
    const { order, productId, intentId } = await placeOrder({ withIntent: true });
    stripe.setStatus(intentId, 'succeeded');

    await runScheduledSweep(env);

    const reservation = await env.DB.prepare(`SELECT status FROM inventory_reservations WHERE order_id = ?`).bind(order.id).first();
    expect(reservation.status).toBe('committed');
    const product = await getProduct(productId);
    expect(product.stock_quantity).toBe(9); // actually decremented, not released back to sale
    expect(product.reserved_quantity).toBe(0);

    const dbOrder = await env.DB.prepare(`SELECT payment_status FROM orders WHERE id = ?`).bind(order.id).first();
    expect(dbOrder.payment_status).toBe('paid');
    expect(stripe.cancelPaymentIntent).not.toHaveBeenCalled();

    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });

  it('leaves a still-processing PaymentIntent alone entirely', async () => {
    const { order, productId, intentId } = await placeOrder({ withIntent: true });
    stripe.setStatus(intentId, 'processing');

    await runScheduledSweep(env);

    const reservation = await env.DB.prepare(`SELECT status FROM inventory_reservations WHERE order_id = ?`).bind(order.id).first();
    expect(reservation.status).toBe('active'); // untouched
    expect(stripe.cancelPaymentIntent).not.toHaveBeenCalled();

    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });

  it('is idempotent -- a second sweep run over already-released rows is a safe no-op', async () => {
    const { order, productId } = await placeOrder({ withIntent: false });
    await runScheduledSweep(env);
    const product = await getProduct(productId);

    await runScheduledSweep(env); // second run finds nothing 'active' left to touch
    const productAfter = await getProduct(productId);
    expect(productAfter.reserved_quantity).toBe(product.reserved_quantity);
    expect(productAfter.stock_quantity).toBe(product.stock_quantity);

    await cleanupOrder(order.id);
    await cleanupProduct(productId);
  });
});
