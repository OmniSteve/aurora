import { centsToAmount } from '../lib/money.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';

export function createOrdersRepository(db) {
  return {
    async listAllAdmin() {
      const { results } = await db.prepare(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 500`).all();
      return Promise.all(results.map((row) => hydrateOrderAdmin(db, row)));
    },

    async getAdminDetail(id) {
      const order = await db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
      return order ? hydrateOrderAdmin(db, order, { includeNotes: true }) : null;
    },

    // Admin-editable operational fields only -- production_status. Money
    // fields (amount_paid_cents/balance_due_cents/total_cents) and
    // payment_status are deliberately not settable here at all -- not just
    // unvalidated by the route schema, but structurally absent from this
    // function's parameters -- so no caller, now or future, can use this
    // generic path to forge a financial status. Those only ever change
    // through services/paymentService.js's Stripe-driven, audited paths
    // (payment success, refund).
    async updateStatus(id, { productionStatus }) {
      if (productionStatus === undefined) return;
      await db
        .prepare(`UPDATE orders SET production_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(productionStatus, id)
        .run();
    },

    async addNote(orderId, text, createdBy) {
      await db
        .prepare(`INSERT INTO order_notes (id, order_id, text, created_by) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), orderId, text, createdBy ?? null)
        .run();
    },

    // Approving flips the order back into the normal payable state
    // (requires_approval = 0, production_status = 'awaiting_payment'), so
    // services/paymentService.js's existing PaymentIntent logic picks it up
    // automatically -- no separate "approved order" payment path exists.
    // An optional total override ("confirm the payable amount") updates
    // total_cents and recomputes balance_due_cents from it; CAS-guarded on
    // requires_approval = 1 so this can't silently no-op-then-succeed twice.
    async approve(id, { totalCents } = {}) {
      const result =
        totalCents != null
          ? await db
              .prepare(
                `UPDATE orders SET total_cents = ?, balance_due_cents = ? - amount_paid_cents, requires_approval = 0, production_status = 'awaiting_payment',
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ? AND requires_approval = 1`,
              )
              .bind(totalCents, totalCents, id)
              .run()
          : await db
              .prepare(
                `UPDATE orders SET requires_approval = 0, production_status = 'awaiting_payment', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ? AND requires_approval = 1`,
              )
              .bind(id)
              .run();
      return result.meta.changes === 1;
    },

    async reject(id) {
      const result = await db
        .prepare(
          `UPDATE orders SET requires_approval = 0, production_status = 'cancelled', payment_status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ? AND requires_approval = 1`,
        )
        .bind(id)
        .run();
      return result.meta.changes === 1;
    },

    // Mints a fresh anonymous-access credential for an order well after
    // checkout (e.g. a balance-payment-request email) -- see
    // routes/orders.js for why the *original* token can't just be reused
    // (it's never stored anywhere but its hash). Overwrites the old hash,
    // so only the newly-returned raw token works from this point on.
    async rotateAccessToken(id) {
      const token = randomToken(24);
      await db.prepare(`UPDATE orders SET access_token_hash = ? WHERE id = ?`).bind(await sha256Hex(token), id).run();
      return token;
    },
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

// Shapes an order for the admin views -- mirrors the historic Base44
// Order/OrderItem/Payment shape (migration/DATA_MODEL.md) closely enough
// that AdminOrders.jsx/AdminOrderDetail.jsx/AdminDashboard.jsx render it
// unmodified; `payments` and `internal_notes` are now real, Stripe- and
// admin-authored rows (order_payments/order_notes) instead of arrays
// rewritten wholesale on every edit.
async function hydrateOrderAdmin(db, order, { includeNotes = false } = {}) {
  const [items, payments, notes] = await Promise.all([
    db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order`).bind(order.id).all(),
    db.prepare(`SELECT * FROM order_payments WHERE order_id = ? ORDER BY created_at`).bind(order.id).all(),
    includeNotes ? db.prepare(`SELECT * FROM order_notes WHERE order_id = ? ORDER BY created_at`).bind(order.id).all() : null,
  ]);

  return {
    id: order.id,
    order_number: order.order_number,
    user_id: order.user_id,
    email: order.email,
    customer_name: order.customer_name,
    phone: order.phone,
    billing_address: order.billing_address ? JSON.parse(order.billing_address) : null,
    shipping_address: order.shipping_address ? JSON.parse(order.shipping_address) : null,
    items: items.results.map(mapOrderItemAdmin),
    subtotal: centsToAmount(order.subtotal_cents),
    shipping_method: order.shipping_method,
    shipping_cost: centsToAmount(order.shipping_cost_cents),
    discount_code: order.discount_code,
    discount_amount: centsToAmount(order.discount_amount_cents),
    tax_amount: centsToAmount(order.tax_amount_cents),
    total: centsToAmount(order.total_cents),
    currency: order.currency,
    deposit_required: centsToAmount(order.deposit_required_cents),
    amount_paid: centsToAmount(order.amount_paid_cents),
    balance_due: centsToAmount(order.balance_due_cents),
    requires_approval: !!order.requires_approval,
    payment_status: order.payment_status,
    production_status: order.production_status,
    payments: payments.results.map(mapPaymentAdmin),
    ...(includeNotes ? { internal_notes: notes.results.map((n) => ({ text: n.text, date: n.created_at })) } : {}),
    created_date: order.created_at,
    updated_date: order.updated_at,
  };
}

function mapOrderItemAdmin(it) {
  return {
    product_id: it.product_id,
    name: it.name,
    image: it.image_url,
    sku: it.sku,
    slug: it.slug,
    quantity: it.quantity,
    unit_price: centsToAmount(it.unit_price_cents),
    options: it.options_json ? JSON.parse(it.options_json) : {},
    options_price: centsToAmount(it.options_price_cents),
    customizations: it.customizations_json ? JSON.parse(it.customizations_json) : [],
    special_request: it.special_request_json ? JSON.parse(it.special_request_json) : null,
    unit_total: centsToAmount(it.unit_total_cents),
    line_total: centsToAmount(it.line_total_cents),
    deposit: centsToAmount(it.deposit_cents),
    requires_approval: !!it.requires_approval,
  };
}

// Never surfaces stripe_payment_intent_id/stripe_charge_id directly --
// `reference` covers what the admin view needs to cross-reference a
// payment without exposing full Stripe object ids as first-class fields.
function mapPaymentAdmin(p) {
  return {
    type: p.type,
    amount: centsToAmount(p.amount_cents),
    status: p.status,
    provider: p.provider,
    reference: p.reference || p.stripe_charge_id || p.stripe_refund_id || null,
    note: p.note,
    date: p.created_at,
  };
}
