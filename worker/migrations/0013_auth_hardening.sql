-- Phase 4: sessions gain CSRF binding and privacy-conscious IP storage,
-- plus two new tables for Google OAuth state and durable rate limiting.

-- CSRF: bound to the session, not a bare double-submit cookie. See
-- worker/src/lib/authGuard.js (requireCsrf) for how this is checked.
ALTER TABLE sessions ADD COLUMN csrf_token_hash TEXT;

-- Privacy (instruction #13): the original `ip TEXT` column (0002_auth.sql)
-- would have retained full client IP addresses indefinitely with no
-- specific operational need. Renamed and repurposed to store
-- HMAC-SHA256(ip, SECURITY_HASH_KEY) instead of the raw address -- enough
-- for "is this the same client as before" security correlation (e.g.
-- spotting session reuse across wildly different networks) without being
-- reversible to the original IP from the stored value, and without keeping
-- the raw address around at all. SECURITY_HASH_KEY is a Worker secret used
-- only for this kind of keyed correlation hashing -- see
-- worker/src/lib/crypto.js and the Phase 4 checkpoint notes on why this is
-- not a "session signing key" (sessions stay opaque-random + SHA-256
-- lookup; nothing about session validity depends on this key).
ALTER TABLE sessions RENAME COLUMN ip TO ip_hash;

-- One-time server-side OAuth state (instruction #10). The browser only
-- ever sees the opaque `state` value in the redirect URL; everything
-- needed to safely complete the flow (PKCE verifier, validated return
-- path) lives here, server-side, consumed exactly once.
CREATE TABLE oauth_states (
  id             TEXT PRIMARY KEY,
  state_hash     TEXT NOT NULL UNIQUE,
  -- Not hashed: the raw verifier must be sent to Google verbatim during
  -- the code exchange, so hashing it would make the row useless for its
  -- one job. Its security value is proving possession of the original
  -- auth request to Google, not resisting DB compromise -- it's already
  -- short-lived (expires_at) and single-use (consumed_at).
  pkce_verifier  TEXT NOT NULL,
  return_to      TEXT NOT NULL DEFAULT '/',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at     TEXT NOT NULL,
  consumed_at    TEXT
);
CREATE INDEX idx_oauth_states_expiry ON oauth_states(expires_at);

-- Durable, per-identity rate limiting (instruction #12), complementing the
-- Workers Rate Limiting binding's coarse edge-local IP throttle. `key` is
-- always an HMAC of (action, normalized identifier) -- see
-- worker/src/lib/rateLimit.js -- never a raw email or IP address. Fixed
-- window: one row per key, reset when window_start advances.
CREATE TABLE rate_limit_counters (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  window_start  TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);
CREATE INDEX idx_rate_limit_counters_expiry ON rate_limit_counters(expires_at);
