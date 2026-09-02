export function createRateLimitRepository(db) {
  return {
    // Atomic fixed-window counter: one UPSERT+RETURNING, no read-then-write
    // race. `key` is already an HMAC (see lib/rateLimit.js) -- never a raw
    // email or IP.
    async increment(key, windowSeconds) {
      const now = Date.now();
      const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();
      const expiresAt = new Date(now + windowSeconds * 1000).toISOString();

      const row = await db
        .prepare(
          `INSERT INTO rate_limit_counters (key, count, window_start, expires_at)
           VALUES (?, 1, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             count = CASE WHEN rate_limit_counters.window_start = excluded.window_start
                          THEN rate_limit_counters.count + 1 ELSE 1 END,
             window_start = excluded.window_start,
             expires_at = excluded.expires_at
           RETURNING count`,
        )
        .bind(key, windowStart, expiresAt)
        .first();

      // Amortized cleanup -- avoid doubling write cost on every single
      // rate-limit check while still keeping the table from growing
      // unboundedly (instruction #12: "add expiry/cleanup for durable
      // rate-limit rows").
      if (Math.random() < 0.05) {
        await db.prepare(`DELETE FROM rate_limit_counters WHERE expires_at < ?`).bind(new Date(now).toISOString()).run();
      }

      return row.count;
    },
  };
}
