-- Payment/refund audit trail and Stripe webhook idempotency.
--
-- order_payments replaces Order.payments[] (a JSON array rewritten wholesale
-- on every admin edit in Base44) with real rows -- an append-only ledger
-- admins can query, and a natural place to hang a Stripe payment_intent /
-- charge / refund id for reconciliation.
--
-- Stripe webhook idempotency: Stripe retries webhook deliveries on any
-- non-2xx response or timeout, so the same event id can arrive more than
-- once. stripe_events is keyed on Stripe's own event id --
--
--   INSERT INTO stripe_events (id, type, status) VALUES (:event_id, :type, 'received');
--   -- PRIMARY KEY conflict -> this event was already received (possibly
--   -- still processing, possibly already processed) -> return 200
--   -- immediately without repeating any side effect (stock decrement,
--   -- order_payments insert, discount commit).
--   -- On success: UPDATE stripe_events SET status = 'processed', processed_at = :now WHERE id = :event_id.
--
-- Combined with signature verification (done in Worker code against the
-- webhook secret, not representable in SQL), this makes the webhook handler
-- safe to receive the same event any number of times.

CREATE TABLE order_payments (
  id                          TEXT PRIMARY KEY,
  order_id                    TEXT NOT NULL REFERENCES orders(id),
  type                        TEXT NOT NULL CHECK (type IN ('full','deposit','balance','additional_charge','refund')),
  amount_cents                INTEGER NOT NULL,
  status                      TEXT NOT NULL CHECK (status IN ('requested','succeeded','failed')),
  provider                    TEXT NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe','manual')),
  stripe_payment_intent_id    TEXT,
  stripe_charge_id            TEXT,
  stripe_refund_id            TEXT,
  reference                   TEXT,
  note                        TEXT,
  created_by                  TEXT REFERENCES users(id),   -- NULL for webhook-originated rows
  created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_order_payments_order ON order_payments(order_id);

CREATE TABLE stripe_events (
  id            TEXT PRIMARY KEY,   -- Stripe event id, e.g. evt_...
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','failed')),
  payload       TEXT,               -- raw event JSON, for audit/replay/debugging
  error         TEXT,
  received_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at  TEXT
);
CREATE INDEX idx_stripe_events_type_received ON stripe_events(type, received_at);
