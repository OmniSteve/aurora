// Implements the Phase 1 reservation design (worker/migrations/
// 0003_inventory.sql, extended by 0010_reservation_lifecycle.sql). A
// reservation is a hold, not a stock decrement -- see the migration file
// for the full CAS pattern this is built on. Real stock_quantity
// consumption happens in Phase 7, after payment succeeds.
const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes -- long enough for a checkout attempt, short enough not to hold stock hostage indefinitely

export function createInventoryRepository(db) {
  return {
    // Atomic compare-and-swap: succeeds only if enough unreserved stock
    // exists right now. Returns true/false -- never throws for "not enough
    // stock", since that's an expected, not exceptional, outcome.
    async tryReserve({ id, productId, orderId, quantity }) {
      const result = await db
        .prepare(
          `UPDATE products
              SET reserved_quantity = reserved_quantity + ?
            WHERE id = ? AND (stock_quantity - reserved_quantity) >= ?`,
        )
        .bind(quantity, productId, quantity)
        .run();

      if (result.meta.changes !== 1) return false;

      await db
        .prepare(
          `INSERT INTO inventory_reservations (id, product_id, order_id, quantity, status, expires_at)
           VALUES (?, ?, ?, ?, 'active', ?)`,
        )
        .bind(id, productId, orderId, quantity, new Date(Date.now() + RESERVATION_TTL_MS).toISOString())
        .run();
      return true;
    },

    // Compensating release -- used both when a checkout attempt fails
    // partway through (Phase 6) and, later, when a payment fails or a
    // reservation expires unclaimed (Phase 7).
    async release(id) {
      const row = await db.prepare(`SELECT * FROM inventory_reservations WHERE id = ? AND status = 'active'`).bind(id).first();
      if (!row) return;
      await db.batch([
        db.prepare(`UPDATE products SET reserved_quantity = reserved_quantity - ? WHERE id = ?`).bind(row.quantity, row.product_id),
        db
          .prepare(`UPDATE inventory_reservations SET status = 'released', released_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
          .bind(id),
      ]);
    },

    async linkToPaymentIntent(orderId, paymentIntentId) {
      await db
        .prepare(`UPDATE inventory_reservations SET stripe_payment_intent_id = ? WHERE order_id = ? AND status = 'active'`)
        .bind(paymentIntentId, orderId)
        .run();
    },

    async findActiveByOrder(orderId) {
      const { results } = await db.prepare(`SELECT * FROM inventory_reservations WHERE order_id = ? AND status = 'active'`).bind(orderId).all();
      return results;
    },

    // Statement pairs for services/paymentService.js to combine into one
    // atomic db.batch() alongside the order_payments insert and order
    // update -- the CAS `WHERE status = 'active'` guard makes re-running
    // this against an already-committed/released row a safe no-op, which is
    // what makes webhook retries and a sweep that resumes after a crash
    // idempotent.
    prepareCommitStatements(row) {
      return [
        db
          .prepare(`UPDATE inventory_reservations SET status = 'committed', committed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'active'`)
          .bind(row.id),
        db
          .prepare(`UPDATE products SET stock_quantity = stock_quantity - ?, reserved_quantity = reserved_quantity - ? WHERE id = ?`)
          .bind(row.quantity, row.quantity, row.product_id),
      ];
    },

    // `status` is 'released' (webhook-driven: payment definitively failed or
    // was canceled) or 'expired' (sweep-driven: the checkout was abandoned
    // and its hold timed out) -- both release the same counter, the
    // distinction is purely for audit/observability.
    prepareReleaseStatements(row, status = 'released') {
      return [
        db
          .prepare(`UPDATE inventory_reservations SET status = ?, released_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'active'`)
          .bind(status, row.id),
        db.prepare(`UPDATE products SET reserved_quantity = reserved_quantity - ? WHERE id = ?`).bind(row.quantity, row.product_id),
      ];
    },
  };
}
