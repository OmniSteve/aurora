import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { call, env } from './helpers.js';
import { seedCategory, seedProduct, seedSettings, cleanupProduct, cleanupOrder, getProduct } from './commerceHelpers.js';
import { mockStripe } from './stripeHelpers.js';
import { runScheduledSweep } from '../src/scheduled.js';
import { createInventoryRepository } from '../src/repositories/inventoryRepository.js';

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

// Regression coverage for the production bug where reserved_quantity went
// negative: prepareCommitStatements()/prepareReleaseStatements() batched a
// products-UPDATE unconditionally alongside a CAS-guarded reservation-row
// UPDATE. A batch doesn't make one statement conditional on another's
// result, so a caller that lost the CAS race (another caller
// released/committed the same row first) still ran its own unconditional
// products-UPDATE, double-decrementing reserved_quantity. Fixed by making
// commitReservation()/releaseReservation()/release() two-step: the
// reservation-row CAS runs first, as its own statement, and its actual
// affected-row count decides whether the products-UPDATE happens at all.
// These tests exercise that directly, with genuine concurrent calls
// (Promise.all, not sequential awaits) -- sequential re-runs alone don't
// prove anything about the race window between read and write.
describe('inventory reservation release/commit race safety', () => {
  const inventory = createInventoryRepository(env.DB);

  // inventory_reservations.order_id has a real FK to orders, so these tests
  // go through the actual order-creation endpoint (exactly like this
  // file's own placeOrder() above) rather than fabricating a random
  // order_id -- that's what naturally leaves an 'active' reservation row
  // behind to race against.
  async function reserve(productId, quantity = 1) {
    const { json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { items: [{ product_id: productId, quantity }], email: 'buyer@example.com' },
    });
    const orderId = json.order.id;
    const row = await env.DB.prepare(`SELECT * FROM inventory_reservations WHERE order_id = ?`).bind(orderId).first();
    return { inventory, id: row.id, orderId, row };
  }

  it('releasing an active reservation once decreases reserved_quantity exactly once', async () => {
    const productId = await seedProduct({ stockQuantity: 10 });
    const { id, orderId } = await reserve(productId);
    expect((await getProduct(productId)).reserved_quantity).toBe(1);

    await inventory.release(id);

    const product = await getProduct(productId);
    expect(product.reserved_quantity).toBe(0);
    expect(product.stock_quantity).toBe(10); // release never touches stock_quantity
    const row = await env.DB.prepare(`SELECT status FROM inventory_reservations WHERE id = ?`).bind(id).first();
    expect(row.status).toBe('released');

    await cleanupOrder(orderId);
    await cleanupProduct(productId);
  });

  it('releasing the same reservation twice sequentially: the second call is a no-op', async () => {
    const productId = await seedProduct({ stockQuantity: 10 });
    const { id, orderId } = await reserve(productId);

    await inventory.release(id);
    await inventory.release(id); // already released -- must not decrement again

    const product = await getProduct(productId);
    expect(product.reserved_quantity).toBe(0);

    await cleanupOrder(orderId);
    await cleanupProduct(productId);
  });

  it('two concurrent release() calls on the same reservation cannot double-decrement reserved_quantity', async () => {
    const productId = await seedProduct({ stockQuantity: 10 });
    const { id, orderId } = await reserve(productId);

    // Genuinely concurrent, not sequential -- both start before either
    // resolves, exercising the read-then-write race window directly.
    await Promise.all([inventory.release(id), inventory.release(id)]);

    const product = await getProduct(productId);
    expect(product.reserved_quantity).toBe(0); // not -1
    expect(product.reserved_quantity).toBeGreaterThanOrEqual(0);

    await cleanupOrder(orderId);
    await cleanupProduct(productId);
  });

  it('concurrent releaseReservation() calls (the sweep/webhook path) cannot double-decrement', async () => {
    const productId = await seedProduct({ stockQuantity: 10 });
    const { orderId, row } = await reserve(productId);

    // Simulates the sweep and a webhook both observing the row as still
    // 'active' before either has written -- exactly the race that produced
    // the negative reserved_quantity in production.
    const [a, b] = await Promise.all([
      inventory.releaseReservation(row, 'expired'),
      inventory.releaseReservation(row, 'released'),
    ]);
    const statements = [a, b].filter(Boolean);
    // Exactly one of the two calls may have won the CAS and returned a
    // products-UPDATE statement to apply; the loser must return null, not
    // a statement that would double-decrement if applied.
    expect(statements.length).toBeLessThanOrEqual(1);
    if (statements.length) await env.DB.batch(statements);

    const product = await getProduct(productId);
    expect(product.reserved_quantity).toBe(0); // not -1

    await cleanupOrder(orderId);
    await cleanupProduct(productId);
  });

  it('commitReservation() racing releaseReservation() on the same row: exactly one wins, never both', async () => {
    const productId = await seedProduct({ stockQuantity: 10 });
    const { id, orderId, row } = await reserve(productId);

    // Simulates a payment succeeding at the exact moment the sweep decides
    // the same reservation looks expired -- the sweep's own retrievePaymentIntent
    // check is what normally prevents this in practice (see the "never
    // releases -- instead commits" sweep test above); this test proves the
    // repository-level primitive is safe even if that check were ever
    // bypassed or raced.
    const [commitStatement, releaseStatement] = await Promise.all([
      inventory.commitReservation(row),
      inventory.releaseReservation(row, 'expired'),
    ]);
    const won = [commitStatement, releaseStatement].filter(Boolean);
    expect(won.length).toBe(1); // exactly one side's CAS succeeded
    await env.DB.batch(won);

    const reservation = await env.DB.prepare(`SELECT status FROM inventory_reservations WHERE id = ?`).bind(id).first();
    expect(['committed', 'expired']).toContain(reservation.status);
    const product = await getProduct(productId);
    expect(product.reserved_quantity).toBe(0);
    // If commit won, stock_quantity must have been consumed exactly once;
    // if release won, stock_quantity must be untouched. Never both, never
    // neither.
    expect(product.stock_quantity).toBe(reservation.status === 'committed' ? 9 : 10);

    await cleanupOrder(orderId);
    await cleanupProduct(productId);
  });

  it('a duplicate commitReservation() call (simulating a duplicate webhook) cannot change reserved_quantity twice', async () => {
    const productId = await seedProduct({ stockQuantity: 10 });
    const { orderId, row } = await reserve(productId);

    const first = await inventory.commitReservation(row);
    expect(first).not.toBeNull();
    await env.DB.batch([first]);

    const second = await inventory.commitReservation(row); // duplicate webhook delivery
    expect(second).toBeNull();

    const product = await getProduct(productId);
    expect(product.stock_quantity).toBe(9); // decremented exactly once
    expect(product.reserved_quantity).toBe(0);

    await cleanupOrder(orderId);
    await cleanupProduct(productId);
  });
});
