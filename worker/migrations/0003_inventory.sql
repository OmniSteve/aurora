-- Inventory reservations.
--
-- Problem: a Stripe payment can take anywhere from seconds (card) to minutes
-- (3DS challenge, wallet redirect) to confirm. Base44 never decremented stock
-- at all (migration/SERVER_REQUIREMENTS.md #13). The new design must stop two
-- concurrent buyers from both "winning" the last unit while a PaymentIntent
-- is in flight, without decrementing real stock before payment is confirmed
-- (a failed payment must not have touched inventory).
--
-- Design: a reservation is a hold, not a decrement. `products.reserved_quantity`
-- is a fast-path counter; available stock is always
-- `stock_quantity - reserved_quantity`. Reserving is a single conditional
-- UPDATE (compare-and-swap) -- no read-then-write race window:
--
--   UPDATE products
--      SET reserved_quantity = reserved_quantity + :qty
--    WHERE id = :product_id
--      AND (stock_quantity - reserved_quantity) >= :qty;
--   -- caller checks meta.changes = 1; 0 rows changed means insufficient stock.
--
-- On payment success (Stripe webhook), the reservation is committed: real
-- stock is decremented and the reservation is released in the same amount --
--
--   UPDATE products
--      SET stock_quantity = stock_quantity - :qty,
--          reserved_quantity = reserved_quantity - :qty
--    WHERE id = :product_id;
--
-- On payment failure/cancellation, or when a reservation's expires_at has
-- passed with no payment, it is released without touching stock_quantity --
--
--   UPDATE products SET reserved_quantity = reserved_quantity - :qty WHERE id = :product_id;
--
-- A scheduled Worker (Cron Trigger, added alongside Stripe in a later phase)
-- sweeps rows where status = 'active' AND expires_at < now and releases them --
-- covers the case where a customer abandons checkout and no webhook ever
-- arrives. Only products with availability != 'made_to_order'/'preorder' and
-- a non-null stock_quantity are stock-controlled; others reserve nothing.

ALTER TABLE products ADD COLUMN reserved_quantity INTEGER NOT NULL DEFAULT 0;

CREATE TABLE inventory_reservations (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  order_id    TEXT NOT NULL REFERENCES orders(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','committed','released','expired')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_inventory_reservations_product_status ON inventory_reservations(product_id, status);
CREATE INDEX idx_inventory_reservations_order ON inventory_reservations(order_id);
-- drives the expiry sweep: WHERE status = 'active' AND expires_at < :now
CREATE INDEX idx_inventory_reservations_sweep ON inventory_reservations(status, expires_at);
