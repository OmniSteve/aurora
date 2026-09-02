-- Extends idempotency_keys with ownership and expiry so a key can never be
-- used to read back another customer's checkout result.
--
-- The original 0005_orders.sql design keyed strictly on the client-minted
-- `key` string. That is sufficient against accidental replay (retries,
-- double-clicks) but not against one customer guessing or reusing another
-- customer's key: a bare `key -> response` lookup would replay whatever
-- response was stored, to whoever presents the key, with no ownership check.
--
-- owner_token_hash is the fix: a SHA-256 hash of whatever bearer credential
-- the caller presented alongside the idempotency key --
--   * the authenticated session token, when signed in, or
--   * an anonymous checkout token (a random value the Worker sets in a
--     short-lived cookie the first time a cart starts checkout) otherwise.
-- On every lookup -- not just the insert -- the Worker re-hashes the
-- caller's *current* credential and compares it to the stored
-- owner_token_hash before returning a cached response. A mismatch is
-- treated as a fresh/foreign request (never a replay), even if the key
-- string itself collides.
--
-- user_id is recorded separately (nullable) purely for admin-facing
-- traceability ("which account made this request") -- it is not itself the
-- ownership check, since most Aurora checkouts are anonymous.
--
-- expires_at gives the row a TTL for cleanup. A short-lived periodic sweep
-- (piggybacking on the same Cron Trigger introduced for reservation expiry
-- in Phase 7) deletes rows past expires_at; nothing user-facing depends on
-- an idempotency_keys row surviving past the checkout window.
--
-- Note: "high-entropy key" is an application-layer contract, not a DB
-- constraint -- the Worker must generate/require a cryptographically random
-- key (e.g. a UUID v4) before insert. SQLite's ALTER TABLE cannot retrofit a
-- CHECK constraint onto the existing `key` column without a full table
-- rebuild; since this table has no production data yet, that constraint can
-- be added cheaply in a later migration if it proves worth enforcing in SQL
-- as well as in code.

ALTER TABLE idempotency_keys ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE idempotency_keys ADD COLUMN owner_token_hash TEXT;
ALTER TABLE idempotency_keys ADD COLUMN expires_at TEXT;
CREATE INDEX idx_idempotency_keys_user ON idempotency_keys(user_id);
CREATE INDEX idx_idempotency_keys_expiry ON idempotency_keys(expires_at);
