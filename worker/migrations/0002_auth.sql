-- Users, sessions and short-lived proof-of-possession tokens.
-- Base44 owned all of this and none of it is exportable (migration/EXPORT.md
-- limitations) -- imported users get password_hash = NULL and
-- must_reset_password = 1, and are pointed at password-reset emails.

CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT,                 -- NULL = no password set yet (imported / OAuth-only)
  password_algo         TEXT,                 -- e.g. 'pbkdf2-sha256' -- future-proofs a hash migration
  full_name             TEXT,
  role                  TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  email_verified        INTEGER NOT NULL DEFAULT 0,
  must_reset_password   INTEGER NOT NULL DEFAULT 0,
  google_sub             TEXT UNIQUE,          -- Google OAuth subject id, once linked
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Server-validated session. The cookie carries an opaque random token;
-- only its SHA-256 hash is stored, so a stolen DB snapshot cannot forge
-- sessions. Replaces Base44's bearer token in localStorage.
CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  token_hash     TEXT NOT NULL UNIQUE,
  user_agent     TEXT,
  ip             TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at     TEXT NOT NULL,
  revoked_at     TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

-- Single-use, expiring, hashed tokens for email-verification OTP and
-- password reset. OAuth CSRF state is handled as a signed cookie instead
-- (stateless, no DB row needed) so this table stays scoped to the two
-- flows that genuinely need a durable, poll-able record.
CREATE TABLE auth_tokens (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),     -- NULL for pre-verification OTP (no account yet)
  email         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('email_verify_otp','password_reset')),
  token_hash    TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,     -- brute-force throttling on OTP guesses
  consumed_at   TEXT,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_auth_tokens_lookup ON auth_tokens(email, type, consumed_at);
