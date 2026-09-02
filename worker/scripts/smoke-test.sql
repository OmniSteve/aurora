-- Local D1 smoke test for the concurrency-critical patterns in the schema.
-- Run with:
--   npx wrangler d1 execute aurora-dev --local --env dev --file worker/scripts/smoke-test.sql --json
--
-- This seeds minimal fixtures and exercises each atomic UPDATE / dedupe
-- INSERT pattern documented in the 0003/0004/0005/0006 migrations. It does
-- NOT assert pass/fail itself (wrangler d1 execute has no branching) --
-- inspect the printed `meta.changes` per statement per the comments below.

-- 1. Fixtures --------------------------------------------------------------
INSERT INTO categories (id, name) VALUES ('cat_1', 'Rings');
INSERT INTO products (id, name, slug, price_cents, category_id, stock_quantity)
  VALUES ('prod_1', 'Solitaire Ring', 'solitaire-ring', 45000, 'cat_1', 1);
INSERT INTO orders (id, order_number, email, subtotal_cents, total_cents)
  VALUES ('ord_1', 'AUR-TEST1', 'test@example.com', 45000, 45000);
INSERT INTO orders (id, order_number, email, subtotal_cents, total_cents)
  VALUES ('ord_2', 'AUR-TEST2', 'test2@example.com', 45000, 45000);
INSERT INTO discount_codes (id, code, type, value, usage_limit)
  VALUES ('disc_1', 'WELCOME10', 'percentage', 10, 1);

-- 2. Inventory reservation CAS: stock_quantity = 1, reserve qty 1 twice.
--    Expect: first UPDATE changes=1 (products.reserved_quantity 0 -> 1),
--             second UPDATE changes=0 (available = 1 - 1 = 0, condition fails).
UPDATE products
   SET reserved_quantity = reserved_quantity + 1
 WHERE id = 'prod_1' AND (stock_quantity - reserved_quantity) >= 1;

UPDATE products
   SET reserved_quantity = reserved_quantity + 1
 WHERE id = 'prod_1' AND (stock_quantity - reserved_quantity) >= 1;

SELECT id, stock_quantity, reserved_quantity FROM products WHERE id = 'prod_1';

-- 3. Discount reservation CAS: usage_limit = 1, reserve twice.
--    Expect: first UPDATE changes=1 (reserved_count 0 -> 1),
--             second UPDATE changes=0 (usage_count + reserved_count = 1 = usage_limit).
UPDATE discount_codes
   SET reserved_count = reserved_count + 1
 WHERE id = 'disc_1' AND active = 1
   AND (usage_limit IS NULL OR (usage_count + reserved_count) < usage_limit);

UPDATE discount_codes
   SET reserved_count = reserved_count + 1
 WHERE id = 'disc_1' AND active = 1
   AND (usage_limit IS NULL OR (usage_count + reserved_count) < usage_limit);

SELECT id, usage_count, reserved_count, usage_limit FROM discount_codes WHERE id = 'disc_1';

-- Commit the discount reservation against ord_1 (simulates payment success):
UPDATE discount_codes
   SET usage_count = usage_count + 1, reserved_count = reserved_count - 1
 WHERE id = 'disc_1';

SELECT id, usage_count, reserved_count FROM discount_codes WHERE id = 'disc_1';

-- 4. Order number counter: atomic UPDATE...RETURNING, called twice.
--    Expect: 1, then 2 -- monotonic, no collision even if called concurrently.
UPDATE counters SET value = value + 1 WHERE name = 'order_number' RETURNING value;
UPDATE counters SET value = value + 1 WHERE name = 'order_number' RETURNING value;

-- 5. Checkout idempotency: same key inserted twice.
--    Expect: first INSERT succeeds; second INSERT fails with a UNIQUE
--    constraint violation on the primary key (that failure IS the point --
--    the caller catches it and looks up the existing row instead of
--    re-running checkout side effects).
INSERT INTO idempotency_keys (key, scope, request_hash, status)
  VALUES ('idem_test_1', 'checkout', 'hash_abc', 'processing');
UPDATE idempotency_keys
   SET status = 'completed', response_status = 201, response_body = '{"orderId":"ord_1"}',
       order_id = 'ord_1', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE key = 'idem_test_1';
SELECT key, status, response_status, order_id FROM idempotency_keys WHERE key = 'idem_test_1';
-- Uncomment to see the expected failure on a duplicate key:
-- INSERT INTO idempotency_keys (key, scope, request_hash, status) VALUES ('idem_test_1', 'checkout', 'hash_abc', 'processing');

-- 6. Stripe webhook idempotency: same event id inserted twice.
--    Expect: first INSERT succeeds; second fails with a PRIMARY KEY
--    violation, which is how the webhook handler detects a duplicate
--    delivery and skips reprocessing.
INSERT INTO stripe_events (id, type, status) VALUES ('evt_test_1', 'payment_intent.succeeded', 'received');
UPDATE stripe_events SET status = 'processed', processed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'evt_test_1';
SELECT id, type, status FROM stripe_events WHERE id = 'evt_test_1';
-- Uncomment to see the expected failure on a duplicate event:
-- INSERT INTO stripe_events (id, type, status) VALUES ('evt_test_1', 'payment_intent.succeeded', 'received');

-- 7. Cleanup fixtures (keep the local DB clean for the next test run).
DELETE FROM discount_codes WHERE id = 'disc_1';
DELETE FROM idempotency_keys WHERE key = 'idem_test_1';
DELETE FROM stripe_events WHERE id = 'evt_test_1';
DELETE FROM orders WHERE id IN ('ord_1', 'ord_2');
DELETE FROM products WHERE id = 'prod_1';
DELETE FROM categories WHERE id = 'cat_1';
UPDATE counters SET value = 0 WHERE name = 'order_number';
