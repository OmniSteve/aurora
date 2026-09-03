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
    //
    // Two-step CAS, not a blind batch: the reservation-row transition
    // (`active` -> `released`) runs first, as its own statement, and its
    // actual affected-row count decides whether products.reserved_quantity
    // is touched at all. A batch of [products UPDATE, reservation UPDATE]
    // -- the previous shape here -- is NOT safe: D1 doesn't make one
    // statement in a batch conditional on another's result, so if this call
    // loses a race (another caller released/committed the same row first),
    // its reservation UPDATE would correctly no-op on the `WHERE
    // status = 'active'` guard, but its products UPDATE would still run
    // unconditionally, double-decrementing reserved_quantity. That's
    // exactly how it went negative in production (see inventoryReservation
    // race regression tests). MAX(0, ...) is a second, independent floor,
    // not a substitute for the CAS -- reserved_quantity should never need
    // it if the CAS is correct, but it costs nothing and guarantees the
    // invariant even if some future bug reintroduces an unguarded path.
    async release(id) {
      const row = await db.prepare(`SELECT product_id, quantity FROM inventory_reservations WHERE id = ?`).bind(id).first();
      if (!row) return;
      const result = await db
        .prepare(`UPDATE inventory_reservations SET status = 'released', released_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'active'`)
        .bind(id)
        .run();
      if (result.meta.changes !== 1) return; // already released/committed elsewhere -- safe no-op
      await db
        .prepare(`UPDATE products SET reserved_quantity = MAX(0, reserved_quantity - ?) WHERE id = ?`)
        .bind(row.quantity, row.product_id)
        .run();
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

    // Two-step CAS (see release()'s comment for why a blind batch of both
    // statements is unsafe): the reservation-row transition runs first, as
    // its own statement; only if it actually won (changes === 1) does this
    // return a products-UPDATE statement at all, for the caller to fold
    // into its own atomic batch alongside the order_payments insert and
    // order update. Returns null on a lost race / already-committed row --
    // callers must treat that as "add nothing to the batch", not an error --
    // which is what makes webhook retries and a sweep that resumes after a
    // crash idempotent, without ever double-decrementing the counters.
    async commitReservation(row) {
      const result = await db
        .prepare(`UPDATE inventory_reservations SET status = 'committed', committed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'active'`)
        .bind(row.id)
        .run();
      if (result.meta.changes !== 1) return null;
      return db
        .prepare(`UPDATE products SET stock_quantity = stock_quantity - ?, reserved_quantity = MAX(0, reserved_quantity - ?) WHERE id = ?`)
        .bind(row.quantity, row.quantity, row.product_id);
    },

    // Same two-step CAS shape as commitReservation() -- see its comment.
    // `status` is 'released' (webhook-driven: payment definitively failed or
    // was canceled) or 'expired' (sweep-driven: the checkout was abandoned
    // and its hold timed out) -- both release the same counter, the
    // distinction is purely for audit/observability.
    async releaseReservation(row, status = 'released') {
      const result = await db
        .prepare(`UPDATE inventory_reservations SET status = ?, released_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'active'`)
        .bind(status, row.id)
        .run();
      if (result.meta.changes !== 1) return null;
      return db
        .prepare(`UPDATE products SET reserved_quantity = MAX(0, reserved_quantity - ?) WHERE id = ?`)
        .bind(row.quantity, row.product_id);
    },
  };
}
