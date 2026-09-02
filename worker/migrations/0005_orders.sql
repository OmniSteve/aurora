-- Orders, order line snapshots, admin notes, order numbering, and checkout
-- idempotency.
--
-- Order numbers: Base44's AUR-<Date.now().toString(36)> is generated in the
-- browser and is not guaranteed unique under concurrency
-- (migration/SERVER_REQUIREMENTS.md #11). Replaced with a single atomic
-- counter row and SQLite's UPDATE...RETURNING:
--
--   UPDATE counters SET value = value + 1 WHERE name = 'order_number' RETURNING value;
--   -- order_number = 'AUR-' || base36(value), zero-padded
--
-- Checkout idempotency: the client mints one random key per checkout attempt
-- (stored client-side alongside the cart, sent as an Idempotency-Key header)
-- so that a network retry, a double-click on "Place order", or a browser
-- back/forward after a redirect never creates two orders for one attempt.
--
--   INSERT INTO idempotency_keys (key, scope, request_hash, status)
--        VALUES (:key, 'checkout', :hash, 'processing');
--   -- PRIMARY KEY conflict -> another (or the same) request already owns
--   -- this key. Look the row up:
--   --   status = 'completed' AND request_hash = :hash -> replay the stored
--   --     response verbatim; no side effects re-run.
--   --   status = 'completed' AND request_hash != :hash -> 409: this key was
--   --     already used for a different request body.
--   --   status = 'processing' -> 409: a request with this key is still in
--   --     flight; the client should not retry yet.
--   -- On success or a deterministic business-rule failure (e.g. out of
--   -- stock), the handler UPDATEs the row to status = 'completed' with the
--   -- response captured, so a retry of a truly failed attempt returns the
--   -- same answer instead of re-running side effects.

CREATE TABLE counters (
  name   TEXT PRIMARY KEY,
  value  INTEGER NOT NULL DEFAULT 0
);
INSERT INTO counters (name, value) VALUES ('order_number', 0);

CREATE TABLE orders (
  id                          TEXT PRIMARY KEY,
  order_number                TEXT NOT NULL UNIQUE,
  user_id                     TEXT REFERENCES users(id),
  email                       TEXT NOT NULL,
  customer_name               TEXT,
  phone                       TEXT,
  billing_address             TEXT,     -- JSON: {line1,line2,city,postcode,country}
  shipping_address            TEXT,
  subtotal_cents              INTEGER NOT NULL,
  shipping_method             TEXT,
  shipping_cost_cents         INTEGER NOT NULL DEFAULT 0,
  discount_code               TEXT,
  discount_amount_cents       INTEGER NOT NULL DEFAULT 0,
  tax_amount_cents            INTEGER NOT NULL DEFAULT 0,
  total_cents                 INTEGER NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'GBP',
  deposit_required_cents      INTEGER NOT NULL DEFAULT 0,
  amount_paid_cents           INTEGER NOT NULL DEFAULT 0,
  balance_due_cents           INTEGER NOT NULL DEFAULT 0,
  requires_approval           INTEGER NOT NULL DEFAULT 0,
  payment_status              TEXT NOT NULL DEFAULT 'pending'
                                CHECK (payment_status IN ('pending','processing','deposit_paid','paid','failed','cancelled','partially_refunded','refunded')),
  production_status           TEXT NOT NULL DEFAULT 'awaiting_payment'
                                CHECK (production_status IN ('awaiting_payment','awaiting_approval','confirmed','in_production','quality_check','ready_to_dispatch','dispatched','delivered','cancelled')),
  stripe_payment_intent_id    TEXT,
  idempotency_key             TEXT,
  reservation_expires_at      TEXT,     -- mirrors the inventory/discount reservation expiry for this order
  created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_status ON orders(payment_status, production_status);
CREATE INDEX idx_orders_email ON orders(email);
CREATE INDEX idx_orders_stripe_intent ON orders(stripe_payment_intent_id);

CREATE TABLE order_items (
  id                     TEXT PRIMARY KEY,
  order_id               TEXT NOT NULL REFERENCES orders(id),
  product_id             TEXT REFERENCES products(id),
  name                   TEXT NOT NULL,
  image_url              TEXT,
  sku                    TEXT,
  slug                   TEXT,
  quantity               INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents       INTEGER NOT NULL,
  options_json           TEXT,          -- { [optionName]: label | true | string | number }
  options_price_cents    INTEGER NOT NULL DEFAULT 0,
  customizations_json    TEXT,          -- [{ label, value, price_cents }]
  special_request_json   TEXT,          -- { text, images: string[], payment_behaviour } | null
  unit_total_cents       INTEGER NOT NULL,
  line_total_cents       INTEGER NOT NULL,
  deposit_cents          INTEGER NOT NULL DEFAULT 0,
  requires_approval      INTEGER NOT NULL DEFAULT 0,
  sort_order             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_notes (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  text        TEXT NOT NULL,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_order_notes_order ON order_notes(order_id);

CREATE TABLE idempotency_keys (
  key              TEXT PRIMARY KEY,
  scope            TEXT NOT NULL,
  request_hash     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed')),
  response_status  INTEGER,
  response_body    TEXT,
  order_id         TEXT REFERENCES orders(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at     TEXT
);
CREATE INDEX idx_idempotency_keys_scope_created ON idempotency_keys(scope, created_at);
