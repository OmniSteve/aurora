import { describe, it, expect, beforeAll } from 'vitest';
import { call, env } from './helpers.js';
import { seedCategory, seedProduct, seedSettings, seedDiscount, cleanupProduct, cleanupOrder, cleanupDiscount, getProduct } from './commerceHelpers.js';

// These fire genuinely concurrent requests (Promise.all, not sequential
// awaits) against the same real D1 instance vitest-pool-workers provides --
// exercising the actual CAS SQL under a race, not just asserting the code
// looks right in isolation (instruction #10/#15).

beforeAll(async () => {
  await seedCategory('cat_test');
  await seedSettings();
});

function idem() {
  return crypto.randomUUID();
}

async function placeOrder(productId, quantity = 1, extra = {}) {
  return call('/api/orders', {
    method: 'POST',
    headers: { 'idempotency-key': idem() },
    body: { items: [{ product_id: productId, quantity }], email: 'buyer@example.com', ...extra },
  });
}

describe('concurrency: inventory', () => {
  it('two concurrent customers cannot both reserve the final unit', async () => {
    const productId = await seedProduct({ availability: 'in_stock', stockQuantity: 1 });

    const [a, b] = await Promise.all([placeOrder(productId, 1), placeOrder(productId, 1)]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);

    // One succeeds (201); the other loses the CAS race for the last unit
    // (409 insufficient_stock) -- never both 201.
    expect(statuses).toEqual([201, 409]);

    const product = await getProduct(productId);
    // Exactly one unit reserved -- never 2 (oversold) and never 0 (the
    // winning reservation lost).
    expect(product.reserved_quantity).toBe(1);

    const winner = a.status === 201 ? a : b;
    await cleanupOrder(winner.json.order.id);
    await cleanupProduct(productId);
  });

  it('N concurrent requests for a batch of M units never reserve more than M', async () => {
    const stock = 5;
    const productId = await seedProduct({ availability: 'in_stock', stockQuantity: stock });

    const attempts = await Promise.all(Array.from({ length: 10 }, () => placeOrder(productId, 1)));
    const succeeded = attempts.filter((r) => r.status === 201);
    const rejected = attempts.filter((r) => r.status !== 201);

    expect(succeeded.length).toBe(stock);
    expect(rejected.length).toBe(10 - stock);

    const product = await getProduct(productId);
    expect(product.reserved_quantity).toBe(stock);

    for (const r of succeeded) await cleanupOrder(r.json.order.id);
    await cleanupProduct(productId);
  });
});

describe('concurrency: discounts', () => {
  it('two concurrent checkouts cannot both claim a single-use discount', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    const code = `RACE${Date.now()}`;
    const discountId = await seedDiscount({ code, value: 10, usageLimit: 1 });

    const [a, b] = await Promise.all([
      placeOrder(productId, 1, { discount_code: code }),
      placeOrder(productId, 1, { discount_code: code }),
    ]);

    const succeeded = [a, b].filter((r) => r.status === 201);
    const rejected = [a, b].filter((r) => r.status !== 201);
    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].json.error).toBe('discount_unavailable');

    const discount = await env.DB.prepare(`SELECT * FROM discount_codes WHERE id = ?`).bind(discountId).first();
    expect(discount.reserved_count).toBe(1); // exactly one reservation held, not two

    await cleanupOrder(succeeded[0].json.order.id);
    await cleanupProduct(productId);
    await cleanupDiscount(discountId);
  });
});
