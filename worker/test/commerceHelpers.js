import { env } from './helpers.js';

export async function seedCategory(id = 'cat_test') {
  await env.DB.prepare(`INSERT INTO categories (id, name, slug, published) VALUES (?, 'Test Category', ?, 1)`).bind(id, `${id}-slug`).run();
  return id;
}

export async function seedProduct({
  id,
  name = 'Test Product',
  slug,
  priceCents = 10000,
  salePriceCents = null,
  availability = 'in_stock',
  stockQuantity = 10,
  categoryId = 'cat_test',
  status = 'published',
} = {}) {
  const pid = id || crypto.randomUUID();
  await env.DB
    .prepare(
      `INSERT INTO products (id, name, slug, price_cents, sale_price_cents, category_id, availability, stock_quantity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(pid, name, slug || pid, priceCents, salePriceCents, categoryId, availability, stockQuantity, status)
    .run();
  return pid;
}

export async function seedOption(
  productId,
  { name = 'Size', type = 'dropdown', required = true, values = [{ label: 'S', priceModifierCents: 0, available: 1 }, { label: 'L', priceModifierCents: 500, available: 1 }] } = {},
) {
  const optId = crypto.randomUUID();
  await env.DB
    .prepare(`INSERT INTO product_options (id, product_id, name, type, required, sort_order) VALUES (?, ?, ?, ?, ?, 0)`)
    .bind(optId, productId, name, type, required ? 1 : 0)
    .run();
  for (const [i, v] of values.entries()) {
    await env.DB
      .prepare(`INSERT INTO product_option_values (id, option_id, label, price_modifier_cents, available, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), optId, v.label, v.priceModifierCents, v.available, i)
      .run();
  }
  return optId;
}

export async function seedCustomization(productId, { label = 'Engraving', priceCents = 500, maxLength = 20 } = {}) {
  await env.DB
    .prepare(`INSERT INTO product_customizations (id, product_id, label, type, price_cents, max_length, sort_order) VALUES (?, ?, ?, 'text', ?, ?, 0)`)
    .bind(crypto.randomUUID(), productId, label, priceCents, maxLength)
    .run();
}

export async function seedDeposit(productId, { enabled = true, type = 'percentage', value = 30 } = {}) {
  await env.DB
    .prepare(`INSERT INTO product_deposit (product_id, enabled, type, value) VALUES (?, ?, ?, ?)`)
    .bind(productId, enabled ? 1 : 0, type, value)
    .run();
}

export async function seedSpecialRequest(productId, { enabled = true, allowImages = true, maxImages = 3, paymentBehaviour = 'approval' } = {}) {
  await env.DB
    .prepare(`INSERT INTO product_special_request (product_id, enabled, message, allow_images, max_images, payment_behaviour) VALUES (?, ?, 'msg', ?, ?, ?)`)
    .bind(productId, enabled ? 1 : 0, allowImages ? 1 : 0, maxImages, paymentBehaviour)
    .run();
}

export async function seedSettings({ taxRate = 20, pricesIncludeTax = 1, shippingPriceCents = 495, freeOverCents = 15000 } = {}) {
  await env.DB.prepare(`DELETE FROM store_settings`).run();
  await env.DB
    .prepare(`INSERT INTO store_settings (id, store_name, currency, currency_symbol, tax_rate, prices_include_tax) VALUES (1, 'Aurora', 'GBP', '£', ?, ?)`)
    .bind(taxRate, pricesIncludeTax)
    .run();
  await env.DB.prepare(`DELETE FROM shipping_methods`).run();
  await env.DB
    .prepare(`INSERT INTO shipping_methods (id, name, price_cents, free_over_cents, sort_order) VALUES ('ship_standard', 'Standard', ?, ?, 0)`)
    .bind(shippingPriceCents, freeOverCents)
    .run();
}

export async function seedDiscount({ id, code, type = 'percentage', value = 10, usageLimit = null, active = 1, minSpendCents = 0 } = {}) {
  const did = id || crypto.randomUUID();
  await env.DB
    .prepare(`INSERT INTO discount_codes (id, code, type, value, min_spend_cents, usage_limit, active) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(did, code, type, value, minSpendCents, usageLimit, active)
    .run();
  return did;
}

export async function cleanupProduct(productId) {
  await env.DB.prepare(`DELETE FROM product_option_values WHERE option_id IN (SELECT id FROM product_options WHERE product_id = ?)`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM product_options WHERE product_id = ?`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM product_customizations WHERE product_id = ?`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM product_special_request WHERE product_id = ?`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM product_deposit WHERE product_id = ?`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM product_images WHERE product_id = ?`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM product_materials WHERE product_id = ?`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM product_collections WHERE product_id = ?`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM inventory_reservations WHERE product_id = ?`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM order_items WHERE product_id = ?`).bind(productId).run();
  await env.DB.prepare(`DELETE FROM products WHERE id = ?`).bind(productId).run();
}

export async function cleanupCategory(categoryId) {
  await env.DB.prepare(`DELETE FROM categories WHERE id = ?`).bind(categoryId).run();
}

export async function cleanupOrder(orderId) {
  await env.DB.prepare(`DELETE FROM inventory_reservations WHERE order_id = ?`).bind(orderId).run();
  await env.DB.prepare(`DELETE FROM discount_reservations WHERE order_id = ?`).bind(orderId).run();
  await env.DB.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(orderId).run();
  await env.DB.prepare(`DELETE FROM order_payments WHERE order_id = ?`).bind(orderId).run();
  await env.DB.prepare(`UPDATE idempotency_keys SET order_id = NULL WHERE order_id = ?`).bind(orderId).run();
  await env.DB.prepare(`DELETE FROM orders WHERE id = ?`).bind(orderId).run();
}

export async function cleanupDiscount(discountId) {
  await env.DB.prepare(`DELETE FROM discount_reservations WHERE discount_code_id = ?`).bind(discountId).run();
  await env.DB.prepare(`DELETE FROM discount_codes WHERE id = ?`).bind(discountId).run();
}

export async function cleanupIdempotencyKey(key) {
  await env.DB.prepare(`DELETE FROM idempotency_keys WHERE key = ?`).bind(key).run();
}

export function getProduct(productId) {
  return env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(productId).first();
}
