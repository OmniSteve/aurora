export function createOrdersRepository(db) {
  return {
    // Atomic UPDATE...RETURNING counter -- guaranteed unique under
    // concurrency, unlike Base44's client-side Date.now().toString(36)
    // (migration/SERVER_REQUIREMENTS.md #11).
    async nextOrderNumber() {
      const row = await db
        .prepare(`UPDATE counters SET value = value + 1 WHERE name = 'order_number' RETURNING value`)
        .first();
      return `AUR-${row.value.toString(36).toUpperCase()}`;
    },

    // The order header + its line items, written together atomically.
    // Deliberately happens *before* any inventory/discount reservation:
    // inventory_reservations.order_id and discount_reservations.order_id
    // are foreign keys against orders(id), so the order must exist first.
    // See services/checkoutService.js for the compensating deleteOrder()
    // call if a reservation fails after this succeeds.
    async insertOrderBatch(statements) {
      return db.batch(statements);
    },

    // Full rollback of an order that turned out not to be backed by valid
    // reservations. inventory_reservations/discount_reservations rows are
    // deleted here too (not just released) -- release() already did its
    // counter decrement for whichever reservations it processed
    // (checkoutService.js's catch block), so this is purely removing rows
    // that still carry a FOREIGN KEY on order_id, which would otherwise
    // block deleting the order itself. A "released" row with no order
    // behind it has no audit value -- this attempt never really happened.
    async deleteOrder(orderId) {
      await db.batch([
        db.prepare(`DELETE FROM inventory_reservations WHERE order_id = ?`).bind(orderId),
        db.prepare(`DELETE FROM discount_reservations WHERE order_id = ?`).bind(orderId),
        db.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(orderId),
        db.prepare(`DELETE FROM orders WHERE id = ?`).bind(orderId),
      ]);
    },

    prepareInsertOrder(order) {
      return db
        .prepare(
          `INSERT INTO orders (
             id, order_number, user_id, email, customer_name, phone, billing_address, shipping_address,
             subtotal_cents, shipping_method, shipping_cost_cents, discount_code, discount_amount_cents,
             tax_amount_cents, total_cents, currency, deposit_required_cents, amount_paid_cents, balance_due_cents,
             requires_approval, payment_status, production_status, idempotency_key, reservation_expires_at, access_token_hash
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          order.id, order.orderNumber, order.userId, order.email, order.customerName, order.phone,
          JSON.stringify(order.billingAddress), JSON.stringify(order.shippingAddress),
          order.subtotalCents, order.shippingMethod, order.shippingCostCents, order.discountCode, order.discountAmountCents,
          order.taxAmountCents, order.totalCents, order.currency, order.depositRequiredCents, 0, order.balanceDueCents,
          order.requiresApproval ? 1 : 0, 'pending', order.productionStatus, order.idempotencyKey, order.reservationExpiresAt,
          order.accessTokenHash,
        );
    },

    prepareInsertOrderItem(item) {
      return db
        .prepare(
          `INSERT INTO order_items (
             id, order_id, product_id, name, image_url, sku, slug, quantity, unit_price_cents, options_json,
             options_price_cents, customizations_json, special_request_json, unit_total_cents, line_total_cents,
             deposit_cents, requires_approval, sort_order
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          item.id, item.orderId, item.productId, item.name, item.imageUrl, item.sku, item.slug, item.quantity,
          item.unitPriceCents, JSON.stringify(item.options), item.optionsPriceCents, JSON.stringify(item.customizations),
          item.specialRequest ? JSON.stringify(item.specialRequest) : null, item.unitTotalCents, item.lineTotalCents,
          item.depositCents, item.requiresApproval ? 1 : 0, item.sortOrder,
        );
    },

    // Ownership-gated lookup: an authenticated caller must own the order
    // (user_id match); an anonymous caller must present the opaque access
    // token minted at creation. Neither path trusts the order id alone.
    async findForAccess(id, { userId, accessTokenHash }) {
      const order = await db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
      if (!order) return null;
      const ownedBySession = userId && order.user_id === userId;
      const ownedByToken = accessTokenHash && order.access_token_hash && order.access_token_hash === accessTokenHash;
      if (!ownedBySession && !ownedByToken) return null;

      const { results: items } = await db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order`).bind(id).all();
      return { order, items };
    },

    // Unlike findForAccess, no ownership check -- used by payment paths
    // (webhook, admin refund, sweep) that already establish their own
    // authority (Stripe signature, admin session, the sweep's own cron
    // trigger) and need the order regardless of who "owns" it.
    findById(id) {
      return db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
    },

    // orders.stripe_payment_intent_id tracks the *current* in-flight or
    // most-recently-created PaymentIntent for this order -- the durable,
    // append-only history lives in order_payments. Safe to overwrite once a
    // prior intent has reached a terminal state (services/paymentService.js
    // only calls this when creating a genuinely new intent).
    async setStripePaymentIntentId(orderId, paymentIntentId) {
      await db
        .prepare(`UPDATE orders SET stripe_payment_intent_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(paymentIntentId, orderId)
        .run();
    },

    prepareInsertPayment({ id, orderId, type, amountCents, status, stripePaymentIntentId, stripeChargeId, stripeRefundId, reference, note, createdBy }) {
      return db
        .prepare(
          `INSERT INTO order_payments (id, order_id, type, amount_cents, status, provider, stripe_payment_intent_id, stripe_charge_id, stripe_refund_id, reference, note, created_by)
           VALUES (?, ?, ?, ?, ?, 'stripe', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, orderId, type, amountCents, status, stripePaymentIntentId ?? null, stripeChargeId ?? null, stripeRefundId ?? null, reference ?? null, note ?? null, createdBy ?? null);
    },

    findPaymentBySucceededIntent(paymentIntentId) {
      return db
        .prepare(`SELECT 1 FROM order_payments WHERE stripe_payment_intent_id = ? AND status = 'succeeded' LIMIT 1`)
        .bind(paymentIntentId)
        .first();
    },

    prepareUpdateOnPaymentSuccess({ orderId, amountPaidCents, balanceDueCents, paymentStatus, productionStatus }) {
      return db
        .prepare(
          `UPDATE orders
              SET amount_paid_cents = ?, balance_due_cents = ?, payment_status = ?, production_status = ?,
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ?`,
        )
        .bind(amountPaidCents, balanceDueCents, paymentStatus, productionStatus, orderId);
    },

    // Only downgrades payment_status when it's still in a pre-success state --
    // a failed/canceled event arriving after (or racing) a success must never
    // knock a paid/deposit_paid order back to 'failed'.
    prepareMarkPaymentFailed(orderId) {
      return db
        .prepare(
          `UPDATE orders
              SET payment_status = 'failed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ? AND payment_status IN ('pending','processing','failed')`,
        )
        .bind(orderId);
    },

    async countSucceededRefunds(orderId) {
      const row = await db
        .prepare(`SELECT COUNT(*) AS n FROM order_payments WHERE order_id = ? AND type = 'refund' AND status = 'succeeded'`)
        .bind(orderId)
        .first();
      return row?.n ?? 0;
    },

    prepareUpdateOnRefund({ orderId, amountPaidCents, paymentStatus }) {
      return db
        .prepare(
          `UPDATE orders SET amount_paid_cents = ?, payment_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        )
        .bind(amountPaidCents, paymentStatus, orderId);
    },

    // Drives the reservation-expiry sweep -- every order with at least one
    // still-active, now-expired inventory or discount reservation.
    async findOrderIdsWithExpiredReservations(nowIso) {
      const { results } = await db
        .prepare(
          `SELECT order_id FROM inventory_reservations WHERE status = 'active' AND expires_at < ?
           UNION
           SELECT order_id FROM discount_reservations WHERE status = 'active' AND expires_at < ?`,
        )
        .bind(nowIso, nowIso)
        .all();
      return results.map((r) => r.order_id);
    },
  };
}
