import { centsToAmount, amountToCents } from '../lib/money.js';

// Read-only validation, matching the five-rule cascade from
// migration/SERVER_REQUIREMENTS.md #7 -- but this is advisory only. It
// checks against discount_codes.usage_count/reserved_count without holding a
// reservation, and computes `amount` from a client-supplied subtotal that is
// NOT trusted as authoritative. Phase 6 owns the reservation-backed,
// server-authoritative version used at actual checkout (worker/migrations/
// 0004_discounts.sql). This endpoint exists so the storefront can show
// "code applied" feedback before that exists -- nothing here increments
// usage_count or reserved_count.
export async function evaluateDiscount({ discountsRepository, code, subtotal }) {
  const normalizedCode = (code || '').trim().toUpperCase();
  if (!normalizedCode) return { valid: false, reason: 'Invalid discount code' };

  const record = await discountsRepository.findActiveByCode(normalizedCode);
  if (!record) return { valid: false, reason: 'Invalid discount code' };

  const now = new Date();
  if (record.starts_at && new Date(record.starts_at) > now) {
    return { valid: false, reason: 'This code is not active yet' };
  }
  if (record.ends_at && new Date(record.ends_at) < now) {
    return { valid: false, reason: 'This code has expired' };
  }

  const committedPlusReserved = (record.usage_count || 0) + (record.reserved_count || 0);
  if (record.usage_limit != null && committedPlusReserved >= record.usage_limit) {
    return { valid: false, reason: 'This code has reached its usage limit' };
  }

  const minSpend = centsToAmount(record.min_spend_cents);
  if (minSpend && subtotal < minSpend) {
    return { valid: false, reason: `Minimum spend of £${minSpend} required` };
  }

  const subtotalCents = amountToCents(subtotal);
  // record.value is percentage points for 'percentage', already-pence for 'fixed'.
  const amountCents =
    record.type === 'percentage'
      ? Math.round((subtotalCents * record.value) / 100)
      : Math.min(record.value, subtotalCents);

  return {
    valid: true,
    record: { code: record.code, type: record.type, value: record.value },
    amount: centsToAmount(amountCents),
    advisory: true,
  };
}
