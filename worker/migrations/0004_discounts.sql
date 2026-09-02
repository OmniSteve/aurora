-- Discount codes and reservation-based redemption.
--
-- Base44 incremented usage_count client-side, after order creation, via a
-- separate read-modify-write call (markUsed) -- non-atomic, and wrong if the
-- order never gets paid (migration/SERVER_REQUIREMENTS.md #7). The new design
-- mirrors the inventory reservation pattern in 0003_inventory.sql: reserve a
-- slot atomically when checkout starts, commit it on payment success, release
-- it on failure/expiry. Available uses = usage_limit - usage_count - reserved_count.
--
-- Reserve (single conditional UPDATE, no read-then-write race):
--
--   UPDATE discount_codes
--      SET reserved_count = reserved_count + 1
--    WHERE id = :id AND active = 1
--      AND (usage_limit IS NULL OR (usage_count + reserved_count) < usage_limit);
--   -- caller checks meta.changes = 1; 0 rows changed means the code is exhausted.
--
-- Commit (webhook: payment_intent.succeeded):
--
--   UPDATE discount_codes
--      SET usage_count = usage_count + 1, reserved_count = reserved_count - 1
--    WHERE id = :id;
--
-- Release (payment failed / order cancelled / reservation expired):
--
--   UPDATE discount_codes SET reserved_count = reserved_count - 1 WHERE id = :id;
--
-- Only one code per order (API_CONTRACT.md), so each order holds at most one
-- reservation row here.

CREATE TABLE discount_codes (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  type              TEXT NOT NULL DEFAULT 'percentage' CHECK (type IN ('percentage','fixed')),
  value             INTEGER NOT NULL,              -- percentage points, or fixed pence per `type`
  min_spend_cents   INTEGER NOT NULL DEFAULT 0,
  starts_at         TEXT,
  ends_at           TEXT,
  usage_limit       INTEGER,
  usage_count       INTEGER NOT NULL DEFAULT 0,
  reserved_count    INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE discount_reservations (
  id                 TEXT PRIMARY KEY,
  discount_code_id   TEXT NOT NULL REFERENCES discount_codes(id),
  order_id           TEXT NOT NULL REFERENCES orders(id),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','committed','released','expired')),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at         TEXT NOT NULL
);
CREATE INDEX idx_discount_reservations_code_status ON discount_reservations(discount_code_id, status);
CREATE INDEX idx_discount_reservations_order ON discount_reservations(order_id);
CREATE INDEX idx_discount_reservations_sweep ON discount_reservations(status, expires_at);
