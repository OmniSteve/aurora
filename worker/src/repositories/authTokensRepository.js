// Backs both email-verification OTPs and password-reset tokens (one table,
// worker/migrations/0002_auth.sql -- they're the same shape: hashed,
// single-use, expiring, attempt-limited proof of possession of an email or
// a link).
export function createAuthTokensRepository(db) {
  return {
    async invalidateOutstanding(userId, type) {
      await db
        .prepare(`UPDATE auth_tokens SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND type = ? AND consumed_at IS NULL`)
        .bind(userId, type)
        .run();
    },

    async create({ id, userId, email, type, tokenHash, expiresAt }) {
      await db
        .prepare(`INSERT INTO auth_tokens (id, user_id, email, type, token_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, userId ?? null, email, type, tokenHash, expiresAt)
        .run();
    },

    // OTP verification: the client presents { email, code } -- look up by
    // email+type, then compare the hashed code (see services/authService.js).
    findValidByEmailAndType(email, type) {
      return db
        .prepare(
          `SELECT * FROM auth_tokens WHERE email = ? AND type = ? AND consumed_at IS NULL AND expires_at > ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(email, type, new Date().toISOString())
        .first();
    },

    // Password reset: the client presents just the opaque token from the
    // emailed link -- the token itself is the lookup key.
    findValidByTokenHash(tokenHash, type) {
      return db
        .prepare(`SELECT * FROM auth_tokens WHERE token_hash = ? AND type = ? AND consumed_at IS NULL AND expires_at > ?`)
        .bind(tokenHash, type, new Date().toISOString())
        .first();
    },

    async incrementAttempts(id) {
      const row = await db.prepare(`UPDATE auth_tokens SET attempts = attempts + 1 WHERE id = ? RETURNING attempts`).bind(id).first();
      return row?.attempts ?? null;
    },

    async consume(id) {
      await db.prepare(`UPDATE auth_tokens SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(id).run();
    },
  };
}
