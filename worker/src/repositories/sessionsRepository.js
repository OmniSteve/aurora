// Session lifecycle (documented here since this is the one place all of it
// is enforced):
//
//   - Absolute lifetime only, no sliding/idle renewal: 30 days for normal
//     users, 12 hours for admins (instruction #17 -- "admin sessions may
//     use a shorter lifetime"). Chosen at creation time from the user's
//     role; nothing extends expires_at later.
//   - Rotation: a brand new session (new token, new row) is created on
//     login, on email verification that establishes a session, and
//     implicitly after password reset (which revokes every existing
//     session -- the next login creates a fresh one). There is no
//     automatic mid-session rotation.
//   - last_seen_at is throttled to once per 5 minutes of activity
//     (worker/src/lib/authGuard.js) rather than written on every request.
//   - Expired rows are opportunistically deleted (same amortized 5% chance
//     pattern as rate_limit_counters) rather than left to grow forever;
//     Phase 7's Cron infrastructure can take over bulk cleanup later.
const NORMAL_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function createSessionsRepository(db) {
  return {
    async create({ id, userId, tokenHash, csrfTokenHash, ipHash, userAgent, role }) {
      const ttl = role === 'admin' ? ADMIN_SESSION_TTL_MS : NORMAL_SESSION_TTL_MS;
      const expiresAt = new Date(Date.now() + ttl).toISOString();
      await db
        .prepare(
          `INSERT INTO sessions (id, user_id, token_hash, csrf_token_hash, ip_hash, user_agent, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, userId, tokenHash, csrfTokenHash, ipHash ?? null, userAgent ?? null, expiresAt)
        .run();

      if (Math.random() < 0.05) {
        await db.prepare(`DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL`).bind(new Date().toISOString()).run();
      }

      return { id, expiresAt };
    },

    findActiveByTokenHash(tokenHash) {
      return db
        .prepare(
          `SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1`,
        )
        .bind(tokenHash, new Date().toISOString())
        .first();
    },

    async touchLastSeen(id) {
      await db
        .prepare(`UPDATE sessions SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(id)
        .run();
    },

    async revoke(id) {
      await db.prepare(`UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(id).run();
    },

    async revokeAllForUser(userId) {
      await db
        .prepare(`UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND revoked_at IS NULL`)
        .bind(userId)
        .run();
    },
  };
}
