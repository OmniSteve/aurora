const RESERVATION_TTL_MS = 30 * 60 * 1000; // matches inventoryRepository's checkout-attempt window

export function createDiscountsRepository(db) {
  return {
    findActiveByCode(code) {
      return db.prepare(`SELECT * FROM discount_codes WHERE code = ? AND active = 1 LIMIT 1`).bind(code).first();
    },

    // Same CAS pattern as inventory: available uses = usage_limit -
    // usage_count - reserved_count, enforced atomically by the WHERE
    // clause (worker/migrations/0004_discounts.sql). Returns false rather
    // than throwing when the code is exhausted -- an expected outcome.
    async tryReserve({ id, discountCodeId, orderId }) {
      const result = await db
        .prepare(
          `UPDATE discount_codes
              SET reserved_count = reserved_count + 1
            WHERE id = ? AND active = 1
              AND (usage_limit IS NULL OR (usage_count + reserved_count) < usage_limit)`,
        )
        .bind(discountCodeId)
        .run();

      if (result.meta.changes !== 1) return false;

      await db
        .prepare(
          `INSERT INTO discount_reservations (id, discount_code_id, order_id, status, expires_at)
           VALUES (?, ?, ?, 'active', ?)`,
        )
        .bind(id, discountCodeId, orderId, new Date(Date.now() + RESERVATION_TTL_MS).toISOString())
        .run();
      return true;
    },

    async release(id) {
      const row = await db.prepare(`SELECT * FROM discount_reservations WHERE id = ? AND status = 'active'`).bind(id).first();
      if (!row) return;
      await db.batch([
        db.prepare(`UPDATE discount_codes SET reserved_count = reserved_count - 1 WHERE id = ?`).bind(row.discount_code_id),
        db
          .prepare(`UPDATE discount_reservations SET status = 'released', released_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
          .bind(id),
      ]);
    },
  };
}
