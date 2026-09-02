import { DEFAULT_TTL_MS } from '../lib/idempotency.js';

export function createIdempotencyRepository(db) {
  return {
    // Atomic claim: INSERT wins the race for this key outright (D1 serializes
    // writes), so at most one concurrent caller ever proceeds to execute().
    async begin({ key, scope, requestHash, ownerTokenHash, userId }) {
      try {
        await db
          .prepare(
            `INSERT INTO idempotency_keys (key, scope, request_hash, owner_token_hash, user_id, status, expires_at)
             VALUES (?, ?, ?, ?, ?, 'processing', ?)`,
          )
          .bind(key, scope, requestHash, ownerTokenHash, userId ?? null, new Date(Date.now() + DEFAULT_TTL_MS).toISOString())
          .run();
        return true;
      } catch (err) {
        if (String(err.message || err).includes('UNIQUE')) return false;
        throw err;
      }
    },

    find(key) {
      return db.prepare(`SELECT * FROM idempotency_keys WHERE key = ?`).bind(key).first();
    },

    async complete(key, { status, body, orderId }) {
      await db
        .prepare(
          `UPDATE idempotency_keys
              SET status = 'completed', response_status = ?, response_body = ?, order_id = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE key = ?`,
        )
        .bind(status, JSON.stringify(body), orderId, key)
        .run();
    },
  };
}
