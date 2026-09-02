-- General admin-action audit log. Separate from order_notes/bespoke_notes
-- (which are customer-facing-adjacent, admin-authored free text) -- this is
-- a system-level record of who changed what, for anything with a
-- server-enforced admin gate (migration/SERVER_REQUIREMENTS.md #14):
-- role changes, product/order/settings mutations, manual payment records,
-- discount code edits.

CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY,
  actor_user_id   TEXT REFERENCES users(id),   -- NULL = system/webhook-originated
  action          TEXT NOT NULL,                -- e.g. 'order.status_changed', 'product.deleted'
  entity_type     TEXT NOT NULL,
  entity_id       TEXT,
  before_json     TEXT,
  after_json      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id, created_at DESC);
