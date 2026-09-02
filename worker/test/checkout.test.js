import { describe, it, expect, beforeAll } from 'vitest';
import { call, env, extractCookieValue } from './helpers.js';
import {
  seedCategory, seedProduct, seedOption, seedCustomization, seedDeposit, seedSpecialRequest, seedSettings, seedDiscount,
  cleanupProduct, cleanupOrder, cleanupDiscount, cleanupIdempotencyKey, getProduct,
} from './commerceHelpers.js';

beforeAll(async () => {
  await seedCategory('cat_test');
  await seedSettings();
});

function idem() {
  return crypto.randomUUID();
}

describe('checkout quote + order: trust boundary', () => {
  it('a fake client-supplied price is ignored -- the order uses the D1 price', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    const { status, json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: {
        items: [{ product_id: productId, quantity: 1, unit_price: 1, price: 0.01 }], // extra fields, not part of the schema
        email: 'buyer@example.com',
      },
    });
    expect(status).toBe(201);
    expect(json.order.items[0].line_total).toBe(100); // 10000 cents = £100, not £0.01
    await cleanupOrder(json.order.id);
    await cleanupProduct(productId);
  });

  it('a database price change between quote and order is what the order actually charges', async () => {
    const productId = await seedProduct({ priceCents: 5000 });
    const quote1 = await call('/api/checkout/quote', { method: 'POST', body: { items: [{ product_id: productId, quantity: 1 }] } });
    expect(quote1.json.subtotal).toBe(50);

    await env.DB.prepare(`UPDATE products SET price_cents = 7500 WHERE id = ?`).bind(productId).run();

    const { json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' },
    });
    expect(json.order.items[0].line_total).toBe(75); // new price, not the stale quote's 50

    await cleanupOrder(json.order.id);
    await cleanupProduct(productId);
  });

  it('an option value that does not belong to the product is rejected', async () => {
    const productId = await seedProduct();
    await seedOption(productId);
    const { status, json } = await call('/api/checkout/quote', {
      method: 'POST',
      body: { items: [{ product_id: productId, quantity: 1, options: { Size: 'XXL-does-not-exist' } }] },
    });
    expect(status).toBe(400);
    expect(json.error).toBe('validation_error');
    await cleanupProduct(productId);
  });

  it('an unavailable option value is rejected', async () => {
    const productId = await seedProduct();
    await seedOption(productId, { values: [{ label: 'S', priceModifierCents: 0, available: 1 }, { label: 'Out', priceModifierCents: 0, available: 0 }] });
    const { status, json } = await call('/api/checkout/quote', {
      method: 'POST',
      body: { items: [{ product_id: productId, quantity: 1, options: { Size: 'Out' } }] },
    });
    expect(status).toBe(400);
    expect(json.error).toBe('validation_error');
    await cleanupProduct(productId);
  });

  it('customisation price modifier is calculated from D1, not the client', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    await seedCustomization(productId, { label: 'Engraving', priceCents: 4500 });
    const { json } = await call('/api/checkout/quote', {
      method: 'POST',
      body: { items: [{ product_id: productId, quantity: 1, customizations: { Engraving: 'E & J' } }] },
    });
    expect(json.subtotal).toBe(145); // 100 + 45, the D1 price -- client never sent a price for this
    await cleanupProduct(productId);
  });

  it('sale price is used over the base price when set', async () => {
    const productId = await seedProduct({ priceCents: 10000, salePriceCents: 7500 });
    const { json } = await call('/api/checkout/quote', { method: 'POST', body: { items: [{ product_id: productId, quantity: 2 }] } });
    expect(json.subtotal).toBe(150); // 2 x £75
    await cleanupProduct(productId);
  });

  it('shipping cost respects the free-over threshold from D1 settings', async () => {
    const productId = await seedProduct({ priceCents: 20000 }); // well above the £150 free_over seeded
    const below = await call('/api/checkout/quote', {
      method: 'POST',
      body: { items: [{ product_id: productId, quantity: 1 }], shipping_method: 'Standard' },
    });
    // subtotal £200 >= free_over £150 -> free shipping
    expect(below.json.shipping.cost).toBe(0);

    const cheapProductId = await seedProduct({ priceCents: 1000 });
    const above = await call('/api/checkout/quote', {
      method: 'POST',
      body: { items: [{ product_id: cheapProductId, quantity: 1 }], shipping_method: 'Standard' },
    });
    expect(above.json.shipping.cost).toBe(4.95);

    await cleanupProduct(productId);
    await cleanupProduct(cheapProductId);
  });

  it('VAT is calculated from D1 settings (tax-inclusive pricing)', async () => {
    const productId = await seedProduct({ priceCents: 12000 }); // £120, 20% VAT-inclusive
    const { json } = await call('/api/checkout/quote', { method: 'POST', body: { items: [{ product_id: productId, quantity: 1 }] } });
    expect(json.tax.included).toBe(true);
    expect(json.tax.rate).toBe(20);
    expect(json.tax.amount).toBe(20); // 120 * 20 / 120
    await cleanupProduct(productId);
  });

  it('fixed deposit is capped at the line total and calculated server-side', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    await seedDeposit(productId, { enabled: true, type: 'fixed', value: 15000 }); // deliberately larger than the line total
    const { json } = await call('/api/checkout/quote', { method: 'POST', body: { items: [{ product_id: productId, quantity: 1 }] } });
    expect(json.deposit_required).toBe(100); // capped at the £100 unit total, not £150
    await cleanupProduct(productId);
  });

  it('percentage deposit is calculated server-side', async () => {
    const productId = await seedProduct({ priceCents: 20000 });
    await seedDeposit(productId, { enabled: true, type: 'percentage', value: 30 });
    const { json } = await call('/api/checkout/quote', { method: 'POST', body: { items: [{ product_id: productId, quantity: 1 }] } });
    expect(json.deposit_required).toBe(60); // 30% of £200
    await cleanupProduct(productId);
  });

  it('a made-to-order product with stock_quantity 0 does not fail as out of stock', async () => {
    const productId = await seedProduct({ availability: 'made_to_order', stockQuantity: 0 });
    const { status, json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 3 }], email: 'buyer@example.com' },
    });
    expect(status).toBe(201);
    // No reservation should exist for a made-to-order product either.
    const reservations = await env.DB.prepare(`SELECT COUNT(*) AS n FROM inventory_reservations WHERE product_id = ?`)
      .bind(productId)
      .first();
    expect(reservations.n).toBe(0);

    await cleanupOrder(json.order.id);
    await cleanupProduct(productId);
  });

  it('a genuinely out-of-stock product is rejected', async () => {
    const productId = await seedProduct({ availability: 'out_of_stock', stockQuantity: 0 });
    const { status, json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' },
    });
    expect(status).toBe(400);
    expect(json.details?.unavailable?.[0]?.reason).toBe('out_of_stock');
    await cleanupProduct(productId);
  });

  it('insufficient stock for a stock-controlled product is rejected', async () => {
    const productId = await seedProduct({ availability: 'in_stock', stockQuantity: 2 });
    const { status, json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 5 }], email: 'buyer@example.com' },
    });
    expect(status).toBe(400);
    expect(json.details?.unavailable?.[0]?.reason).toBe('insufficient_stock');
    await cleanupProduct(productId);
  });

  it('an expired discount code is rejected', async () => {
    const discountId = await seedDiscount({ code: 'EXPIRED10', value: 10 });
    await env.DB.prepare(`UPDATE discount_codes SET ends_at = ? WHERE id = ?`).bind(new Date(Date.now() - 86400000).toISOString(), discountId).run();
    const productId = await seedProduct({ priceCents: 10000 });
    const { json } = await call('/api/checkout/quote', {
      method: 'POST',
      body: { items: [{ product_id: productId, quantity: 1 }], discount_code: 'EXPIRED10' },
    });
    expect(json.discount).toBeNull();
    expect(json.discount_error).toMatch(/expired/i);
    await cleanupProduct(productId);
    await cleanupDiscount(discountId);
  });

  it('an invalid discount code is rejected at order creation, not just the quote', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    const { status, json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com', discount_code: 'NOPE-NOT-REAL' },
    });
    expect(status).toBe(400);
    expect(json.error).toBe('validation_error');
    await cleanupProduct(productId);
  });

  it('special requests requiring approval persist requires_approval and awaiting_approval, not a normal payable order', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    await seedSpecialRequest(productId, { enabled: true, paymentBehaviour: 'approval' });
    const { json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: {
        items: [{ product_id: productId, quantity: 1, special_request: { text: 'Please make it extra sparkly' } }],
        email: 'buyer@example.com',
      },
    });
    expect(json.order.requires_approval).toBe(true);
    expect(json.order.production_status).toBe('awaiting_approval');
    expect(json.order.payment_status).toBe('pending');

    const dbOrder = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(json.order.id).first();
    expect(dbOrder.requires_approval).toBe(1);
    expect(dbOrder.production_status).toBe('awaiting_approval');

    await cleanupOrder(json.order.id);
    await cleanupProduct(productId);
  });

  it('a normal order (no special request) is awaiting_payment, never marked paid', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    const { json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' },
    });
    expect(json.order.payment_status).toBe('pending');
    expect(json.order.production_status).toBe('awaiting_payment');
    expect(json.order.amount_paid).toBe(0);
    await cleanupOrder(json.order.id);
    await cleanupProduct(productId);
  });
});

describe('idempotency', () => {
  it('the same key + same request replays the original order rather than creating a second one', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    const key = idem();
    const body = { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' };

    const first = await call('/api/orders', { method: 'POST', headers: { 'idempotency-key': key }, body });
    // Same anonymous checkout cookie the first response minted -- simulates
    // the same browser retrying, not a different caller presenting the
    // same key (that's the ownership check, tested separately below).
    const checkoutCookie = extractCookieValue(first.cookies, 'aurora_checkout');
    const second = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      cookies: { aurora_checkout: checkoutCookie },
      body,
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.json.order.id).toBe(first.json.order.id);

    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE id = ?`).bind(first.json.order.id).first();
    expect(count.n).toBe(1);

    await cleanupOrder(first.json.order.id);
    await cleanupIdempotencyKey(key);
    await cleanupProduct(productId);
  });

  it('a different caller presenting the same key cannot see or replay the original result', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    const key = idem();
    const body = { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' };

    const first = await call('/api/orders', { method: 'POST', headers: { 'idempotency-key': key }, body });
    // Deliberately no cookie carried over -- a fresh anonymous checkout
    // identity, same key.
    const second = await call('/api/orders', { method: 'POST', headers: { 'idempotency-key': key }, body });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.json).not.toHaveProperty('order');

    await cleanupOrder(first.json.order.id);
    await cleanupIdempotencyKey(key);
    await cleanupProduct(productId);
  });

  it('the same key with a changed request returns 409', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    const key = idem();
    const first = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' },
    });
    const checkoutCookie = extractCookieValue(first.cookies, 'aurora_checkout');
    const second = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      cookies: { aurora_checkout: checkoutCookie },
      body: { items: [{ product_id: productId, quantity: 2 }], email: 'buyer@example.com' }, // different quantity
    });
    expect(second.status).toBe(409);
    expect(second.json.error).toBe('idempotency_conflict');

    await cleanupOrder(first.json.order.id);
    await cleanupIdempotencyKey(key);
    await cleanupProduct(productId);
  });

  it('a missing/too-short idempotency key is rejected', async () => {
    const productId = await seedProduct();
    const { status, json } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': 'short' },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'buyer@example.com' },
    });
    expect(status).toBe(400);
    expect(json.error).toBe('validation_error');
    await cleanupProduct(productId);
  });
});

describe('transactional safety: a failed order leaves no reservation behind', () => {
  it('when the discount reservation fails, inventory already reserved in the same attempt is released', async () => {
    const productId = await seedProduct({ availability: 'in_stock', stockQuantity: 5 });
    // usage_limit already exhausted -- the discount CAS will fail deterministically.
    const discountId = await seedDiscount({ code: 'EXHAUSTED5', value: 10, usageLimit: 1 });
    await env.DB.prepare(`UPDATE discount_codes SET usage_count = 1 WHERE id = ?`).bind(discountId).run();

    // Bypass quote-time validation by hitting order creation directly --
    // the DB state changed (exhausted) between an earlier hypothetical
    // quote and now, exactly like the stock/price races above.
    const { status } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 2 }], email: 'buyer@example.com', discount_code: 'EXHAUSTED5' },
    });
    expect(status).toBe(400); // caught by the pre-reservation revalidation

    const product = await getProduct(productId);
    expect(product.reserved_quantity).toBe(0);
    const reservationCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM inventory_reservations WHERE product_id = ? AND status = 'active'`).bind(productId).first();
    expect(reservationCount.n).toBe(0);

    await cleanupProduct(productId);
    await cleanupDiscount(discountId);
  });
});

