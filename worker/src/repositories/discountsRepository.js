import { centsToAmount, amountToCents } from '../lib/money.js';
import { ValidationError } from '../lib/http.js';

const RESERVATION_TTL_MS = 30 * 60 * 1000; // matches inventoryRepository's checkout-attempt window

export function createDiscountsRepository(db) {
  return {
    findActiveByCode(code) {
      return db.prepare(`SELECT * FROM discount_codes WHERE code = ? AND active = 1 LIMIT 1`).bind(code).first();
    },

    async listAllAdmin() {
      const { results } = await db.prepare(`SELECT * FROM discount_codes ORDER BY created_at DESC`).all();
      return results.map(mapDiscount);
    },

    async create(data) {
      const id = crypto.randomUUID();
      const code = String(data.code || '').trim().toUpperCase();
      if (!code) throw new ValidationError('A discount code is required.');
      try {
        await db
          .prepare(
            `INSERT INTO discount_codes (id, code, type, value, min_spend_cents, starts_at, ends_at, usage_limit, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, code, data.type || 'percentage', discountValueToStored(data), amountToCents(data.min_spend || 0), data.starts_at || null, data.ends_at || null, data.usage_limit ?? null, data.active === false ? 0 : 1)
          .run();
      } catch (err) {
        if (String(err.message || err).includes('UNIQUE')) throw new ValidationError('This discount code already exists.');
        throw err;
      }
      return this.getById(id);
    },

    async update(id, data) {
      await db
        .prepare(
          `UPDATE discount_codes SET type = ?, value = ?, min_spend_cents = ?, starts_at = ?, ends_at = ?, usage_limit = ?, active = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ?`,
        )
        .bind(data.type || 'percentage', discountValueToStored(data), amountToCents(data.min_spend || 0), data.starts_at || null, data.ends_at || null, data.usage_limit ?? null, data.active === false ? 0 : 1, id)
        .run();
      return this.getById(id);
    },

    getById(id) {
      return db.prepare(`SELECT * FROM discount_codes WHERE id = ?`).bind(id).first().then((row) => (row ? mapDiscount(row) : null));
    },

    // Disable rather than hard-delete when the code has ever actually been
    // used or is still holding a reservation -- usage_count/reserved_count
    // are the redemption audit trail, and orders/discount_reservations
    // carry a FOREIGN KEY on discount_code_id.
    async remove(id) {
      const row = await db.prepare(`SELECT usage_count, reserved_count FROM discount_codes WHERE id = ?`).bind(id).first();
      if (!row) return;
      if (row.usage_count > 0 || row.reserved_count > 0) {
        await db.prepare(`UPDATE discount_codes SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(id).run();
        return;
      }
      await db.prepare(`DELETE FROM discount_codes WHERE id = ?`).bind(id).run();
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

    async linkToPaymentIntent(orderId, paymentIntentId) {
      await db
        .prepare(`UPDATE discount_reservations SET stripe_payment_intent_id = ? WHERE order_id = ? AND status = 'active'`)
        .bind(paymentIntentId, orderId)
        .run();
    },

    // At most one active discount reservation per order (API_CONTRACT.md).
    findActiveByOrder(orderId) {
      return db.prepare(`SELECT * FROM discount_reservations WHERE order_id = ? AND status = 'active'`).bind(orderId).first();
    },

    // See inventoryRepository.prepareCommitStatements -- same CAS-guarded,
    // batch-combinable pattern.
    prepareCommitStatements(row) {
      return [
        db
          .prepare(`UPDATE discount_reservations SET status = 'committed', committed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'active'`)
          .bind(row.id),
        db
          .prepare(`UPDATE discount_codes SET usage_count = usage_count + 1, reserved_count = reserved_count - 1 WHERE id = ?`)
          .bind(row.discount_code_id),
      ];
    },

    prepareReleaseStatements(row, status = 'released') {
      return [
        db
          .prepare(`UPDATE discount_reservations SET status = ?, released_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'active'`)
          .bind(status, row.id),
        db.prepare(`UPDATE discount_codes SET reserved_count = reserved_count - 1 WHERE id = ?`).bind(row.discount_code_id),
      ];
    },
  };
}

// `value` is percentage points as-is for type 'percentage', or GBP pence
// for type 'fixed' (worker/migrations/0004_discounts.sql) -- only the fixed
// case needs pounds->pence conversion from the admin-facing form.
function discountValueToStored(data) {
  const raw = Number(data.value) || 0;
  return data.type === 'fixed' ? amountToCents(raw) : Math.round(raw);
}

function mapDiscount(row) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.type === 'fixed' ? centsToAmount(row.value) : row.value,
    min_spend: centsToAmount(row.min_spend_cents),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    usage_limit: row.usage_limit,
    usage_count: row.usage_count,
    active: !!row.active,
    created_date: row.created_at,
    updated_date: row.updated_at,
  };
}
