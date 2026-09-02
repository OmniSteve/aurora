// Server-authoritative pricing and order creation. Every money value in
// this file is integer pence from D1 (repositories/productsRepository.js's
// getForPricing / settingsRepository.js's getForPricing) through to the
// order row -- no float arithmetic anywhere on this path. Conversion to
// pounds happens only at the very edge, in routes/checkout.js and
// routes/orders.js, formatting the response.
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { centsToAmount } from '../lib/money.js';
import { ValidationError, HttpError } from '../lib/http.js';

const SELECT_TYPES = new Set(['dropdown', 'buttons', 'swatches', 'radio']);
// Made-to-order and preorder items are never stock-constrained -- their
// stock_quantity is meaningless (typically 0) and must not be read as
// "out of stock" (instruction #4). 'out_of_stock' is handled as an
// explicit block, not a quantity check, below.
const STOCK_CONTROLLED_AVAILABILITY = new Set(['in_stock', 'low_stock', 'out_of_stock']);
const RESERVATION_WINDOW_MS = 30 * 60 * 1000;

function isStockControlled(product) {
  return STOCK_CONTROLLED_AVAILABILITY.has(product.availability);
}

// sale_price is used whenever set, even if numerically higher than price --
// matching migration/SERVER_REQUIREMENTS.md #1's documented (deliberately
// preserved, not "fixed") quirk, so behaviour doesn't silently change
// between the old client-side calculation and this one.
function baseUnitPriceCents(product) {
  return product.salePriceCents != null ? product.salePriceCents : product.priceCents;
}

function optionsPriceCentsFor(product, selections) {
  const sel = selections || {};
  let total = 0;
  for (const opt of product.options) {
    const val = sel[opt.name];
    const provided = val != null && val !== '' && val !== false;
    if (opt.required && !provided) {
      throw new ValidationError(`"${opt.name}" is required for ${product.name}.`);
    }
    if (!provided) continue;
    if (SELECT_TYPES.has(opt.type)) {
      const match = opt.values.find((v) => v.label === val);
      if (!match) throw new ValidationError(`"${val}" is not a valid choice for "${opt.name}".`);
      if (!match.available) throw new ValidationError(`"${val}" is not currently available for "${opt.name}".`);
      total += match.priceModifierCents;
    } else {
      const v0 = opt.values[0];
      if (v0 && !v0.available) throw new ValidationError(`"${opt.name}" is not currently available.`);
      total += v0?.priceModifierCents || 0;
    }
  }
  for (const key of Object.keys(sel)) {
    if (!product.options.some((o) => o.name === key)) {
      throw new ValidationError(`"${key}" is not a valid option for ${product.name}.`);
    }
  }
  return total;
}

function customizationsPriceCentsFor(product, values) {
  const vals = values || {};
  let total = 0;
  const snapshot = [];
  for (const c of product.customizations) {
    const val = vals[c.label];
    if (val == null || val === '' || val === false) continue;
    if (c.maxLength != null && String(val).length > c.maxLength) {
      throw new ValidationError(`"${c.label}" exceeds the maximum length.`);
    }
    total += c.priceCents;
    snapshot.push({ label: c.label, value: String(val), price_cents: c.priceCents });
  }
  for (const key of Object.keys(vals)) {
    if (!product.customizations.some((c) => c.label === key)) {
      throw new ValidationError(`"${key}" is not a valid customisation for ${product.name}.`);
    }
  }
  return { total, snapshot };
}

function depositForLineCents(product, unitTotalCents) {
  const d = product.deposit;
  if (!d?.enabled) return 0;
  const raw = d.type === 'fixed' ? Math.min(d.value, unitTotalCents) : Math.round((unitTotalCents * d.value) / 100);
  return Math.max(0, Math.min(raw, unitTotalCents));
}

async function priceLine(ctx, item) {
  if (!item || typeof item.product_id !== 'string' || !item.product_id) {
    throw new ValidationError('Each item requires a product_id.');
  }
  const quantity = Number(item.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new ValidationError('Quantity must be a whole number between 1 and 100.');
  }

  const product = await ctx.repositories.products.getForPricing(item.product_id);
  if (!product) throw new ValidationError(`One of the items in your cart is no longer available.`);

  const optionsPriceCents = optionsPriceCentsFor(product, item.options);
  const { total: customizationsPriceCents, snapshot: customizationsSnapshot } = customizationsPriceCentsFor(product, item.customizations);
  const unitPriceCents = baseUnitPriceCents(product);
  const unitTotalCents = unitPriceCents + optionsPriceCents + customizationsPriceCents;
  const lineTotalCents = unitTotalCents * quantity;
  const depositCents = depositForLineCents(product, unitTotalCents) * quantity;

  const stockControlled = isStockControlled(product);
  let available = true;
  let availabilityReason = null;
  if (product.availability === 'out_of_stock') {
    available = false;
    availabilityReason = 'out_of_stock';
  } else if (stockControlled && product.stockQuantity - product.reservedQuantity < quantity) {
    available = false;
    availabilityReason = 'insufficient_stock';
  }

  const srConfig = product.specialRequest;
  const hasSpecialRequestText = !!item.special_request?.text;
  const requiresApproval = hasSpecialRequestText && !!srConfig?.paymentBehaviour && srConfig.paymentBehaviour !== 'immediate';
  const specialRequestSnapshot = hasSpecialRequestText
    ? {
        text: String(item.special_request.text),
        images: Array.isArray(item.special_request.images) ? item.special_request.images.slice(0, srConfig?.maxImages ?? 3) : [],
        payment_behaviour: srConfig?.paymentBehaviour || 'immediate',
      }
    : null;

  return {
    productId: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    imageUrl: product.imageUrl,
    quantity,
    unitPriceCents,
    optionsPriceCents,
    customizationsPriceCents,
    unitTotalCents,
    lineTotalCents,
    depositCents,
    stockControlled,
    available,
    availabilityReason,
    options: item.options || {},
    customizations: customizationsSnapshot,
    specialRequest: specialRequestSnapshot,
    requiresApproval,
  };
}

async function evaluateDiscountCents(ctx, { code, subtotalCents }) {
  const normalized = (code || '').trim().toUpperCase();
  if (!normalized) return { valid: false, reason: 'Invalid discount code' };
  const record = await ctx.repositories.discounts.findActiveByCode(normalized);
  if (!record) return { valid: false, reason: 'Invalid discount code' };

  const now = new Date();
  if (record.starts_at && new Date(record.starts_at) > now) return { valid: false, reason: 'This code is not active yet' };
  if (record.ends_at && new Date(record.ends_at) < now) return { valid: false, reason: 'This code has expired' };

  const usedPlusReserved = (record.usage_count || 0) + (record.reserved_count || 0);
  if (record.usage_limit != null && usedPlusReserved >= record.usage_limit) {
    return { valid: false, reason: 'This code has reached its usage limit' };
  }
  if (record.min_spend_cents && subtotalCents < record.min_spend_cents) {
    return { valid: false, reason: `Minimum spend of £${centsToAmount(record.min_spend_cents)} required` };
  }

  const amountCents =
    record.type === 'percentage' ? Math.round((subtotalCents * record.value) / 100) : Math.min(record.value, subtotalCents);
  return { valid: true, id: record.id, code: record.code, amountCents: Math.min(amountCents, subtotalCents) };
}

// The one place totals are computed -- used by both /api/checkout/quote
// (display only, no side effects) and order creation (which calls this
// and then, only if everything checks out, proceeds to reserve + persist).
export async function calculateQuote(ctx, input) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ValidationError('Cart is empty.');
  }

  const lines = [];
  for (const item of input.items) lines.push(await priceLine(ctx, item));

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const settings = await ctx.repositories.settings.getForPricing();

  let discount = null;
  if (input.discount_code) {
    discount = await evaluateDiscountCents(ctx, { code: input.discount_code, subtotalCents });
  }
  const discountAmountCents = discount?.valid ? discount.amountCents : 0;

  const method = settings.shippingMethods.find((m) => m.name === input.shipping_method);
  const shippingCostCents = method ? (method.freeOverCents != null && subtotalCents >= method.freeOverCents ? 0 : method.priceCents) : 0;

  const taxable = Math.max(0, subtotalCents - discountAmountCents);
  const taxRatePercent = settings.taxRatePercent;
  const taxIncluded = settings.pricesIncludeTax;
  const taxAmountCents = taxIncluded
    ? Math.round((taxable * taxRatePercent) / (100 + taxRatePercent))
    : Math.round((taxable * taxRatePercent) / 100);
  const totalCents = taxable + shippingCostCents + (taxIncluded ? 0 : taxAmountCents);

  const depositRequiredCents = lines.reduce((s, l) => s + l.depositCents, 0);
  const dueNowCents = depositRequiredCents > 0 ? Math.min(depositRequiredCents + shippingCostCents, totalCents) : totalCents;
  const balanceLaterCents = totalCents - dueNowCents;

  return {
    lines,
    unavailableLines: lines.filter((l) => !l.available),
    subtotalCents,
    discount,
    discountAmountCents,
    shippingCostCents,
    shippingMethodName: method?.name || null,
    taxAmountCents,
    taxRatePercent,
    taxIncluded,
    totalCents,
    depositRequiredCents,
    dueNowCents,
    balanceLaterCents,
    requiresApproval: lines.some((l) => l.requiresApproval),
    currency: settings.currency,
  };
}

export function quoteToDisplay(quote) {
  return {
    lines: quote.lines.map((l) => ({
      product_id: l.productId,
      name: l.name,
      sku: l.sku,
      image: l.imageUrl,
      quantity: l.quantity,
      unit_price: centsToAmount(l.unitPriceCents),
      options_price: centsToAmount(l.optionsPriceCents),
      customizations_price: centsToAmount(l.customizationsPriceCents),
      unit_total: centsToAmount(l.unitTotalCents),
      line_total: centsToAmount(l.lineTotalCents),
      deposit: centsToAmount(l.depositCents),
      requires_approval: l.requiresApproval,
      available: l.available,
      availability_reason: l.availabilityReason,
    })),
    subtotal: centsToAmount(quote.subtotalCents),
    discount: quote.discount?.valid
      ? { code: quote.discount.code, amount: centsToAmount(quote.discount.amountCents) }
      : null,
    discount_error: quote.discount && !quote.discount.valid ? quote.discount.reason : null,
    shipping: { method: quote.shippingMethodName, cost: centsToAmount(quote.shippingCostCents) },
    tax: { rate: quote.taxRatePercent, included: quote.taxIncluded, amount: centsToAmount(quote.taxAmountCents) },
    total: centsToAmount(quote.totalCents),
    deposit_required: centsToAmount(quote.depositRequiredCents),
    due_now: centsToAmount(quote.dueNowCents),
    balance_due: centsToAmount(quote.totalCents - quote.dueNowCents),
    requires_approval: quote.requiresApproval,
    currency: quote.currency,
    note: 'Totals shown here are recalculated authoritatively when the order is placed -- nothing here is trusted as input.',
  };
}

// Transactional order creation.
//
// Ordering matters here and is not arbitrary: inventory_reservations and
// discount_reservations both carry a FOREIGN KEY on order_id
// (worker/migrations/0003_inventory.sql, 0004_discounts.sql), so the order
// row must exist before either reservation can be inserted. The order
// (with its final, authoritative totals already computed) is therefore
// written first; the CAS reservations happen after, referencing it. If a
// reservation fails, the compensation is symmetric: release whatever was
// already reserved in this attempt, and delete the order + items that
// turned out not to be backed by real stock/discount capacity -- an order
// row must never persist without valid reservations behind it.
export async function createOrder(ctx, input) {
  const quote = await calculateQuote(ctx, input);

  if (quote.unavailableLines.length > 0) {
    throw new ValidationError(
      `The following items are no longer available: ${quote.unavailableLines.map((l) => l.name).join(', ')}`,
      { unavailable: quote.unavailableLines.map((l) => ({ product_id: l.productId, reason: l.availabilityReason })) },
    );
  }
  if (input.discount_code && !quote.discount?.valid) {
    throw new ValidationError(quote.discount?.reason || 'Invalid discount code');
  }
  if (!input.email || typeof input.email !== 'string') {
    throw new ValidationError('An email address is required.');
  }

  const orderId = crypto.randomUUID();
  const orderNumber = await ctx.repositories.orders.nextOrderNumber();
  const accessToken = input.userId ? null : randomToken(24);
  const accessTokenHash = accessToken ? await sha256Hex(accessToken) : null;
  const reservationExpiresAt = new Date(Date.now() + RESERVATION_WINDOW_MS).toISOString();
  const productionStatus = quote.requiresApproval ? 'awaiting_approval' : 'awaiting_payment';

  const orderStmt = ctx.repositories.orders.prepareInsertOrder({
    id: orderId,
    orderNumber,
    userId: input.userId ?? null,
    email: input.email,
    customerName: input.customer_name ?? null,
    phone: input.phone ?? null,
    billingAddress: input.billing_address ?? null,
    shippingAddress: input.shipping_address ?? null,
    subtotalCents: quote.subtotalCents,
    shippingMethod: quote.shippingMethodName,
    shippingCostCents: quote.shippingCostCents,
    discountCode: quote.discount?.valid ? quote.discount.code : null,
    discountAmountCents: quote.discountAmountCents,
    taxAmountCents: quote.taxAmountCents,
    totalCents: quote.totalCents,
    currency: quote.currency,
    depositRequiredCents: quote.depositRequiredCents,
    balanceDueCents: quote.totalCents,
    requiresApproval: quote.requiresApproval,
    productionStatus,
    idempotencyKey: input.idempotencyKey ?? null,
    reservationExpiresAt,
    accessTokenHash,
  });

  const itemStmts = quote.lines.map((line, i) =>
    ctx.repositories.orders.prepareInsertOrderItem({
      id: crypto.randomUUID(),
      orderId,
      productId: line.productId,
      name: line.name,
      imageUrl: line.imageUrl,
      sku: line.sku,
      slug: line.slug,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      options: line.options,
      optionsPriceCents: line.optionsPriceCents,
      customizations: line.customizations,
      specialRequest: line.specialRequest,
      unitTotalCents: line.unitTotalCents,
      lineTotalCents: line.lineTotalCents,
      depositCents: line.depositCents,
      requiresApproval: line.requiresApproval,
      sortOrder: i,
    }),
  );

  await ctx.repositories.orders.insertOrderBatch([orderStmt, ...itemStmts]);

  const reservationsMade = [];
  try {
    for (const line of quote.lines) {
      if (!line.stockControlled) continue;
      const reservationId = crypto.randomUUID();
      const ok = await ctx.repositories.inventory.tryReserve({
        id: reservationId,
        productId: line.productId,
        orderId,
        quantity: line.quantity,
      });
      if (!ok) throw new HttpError(409, 'insufficient_stock', `"${line.name}" no longer has enough stock available.`);
      reservationsMade.push({ type: 'inventory', id: reservationId });
    }

    if (quote.discount?.valid) {
      const discountReservationId = crypto.randomUUID();
      const ok = await ctx.repositories.discounts.tryReserve({
        id: discountReservationId,
        discountCodeId: quote.discount.id,
        orderId,
      });
      if (!ok) throw new HttpError(409, 'discount_unavailable', 'This discount code just reached its usage limit.');
      reservationsMade.push({ type: 'discount', id: discountReservationId });
    }
  } catch (err) {
    for (const r of reservationsMade.reverse()) {
      if (r.type === 'inventory') await ctx.repositories.inventory.release(r.id);
      else await ctx.repositories.discounts.release(r.id);
    }
    await ctx.repositories.orders.deleteOrder(orderId);
    throw err;
  }

  return {
    order: {
      id: orderId,
      order_number: orderNumber,
      customer_name: input.customer_name ?? null,
      email: input.email,
      items: quote.lines.map((l) => ({
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        options: l.options,
        customizations: l.customizations.map((c) => ({ label: c.label, value: c.value, price: centsToAmount(c.price_cents) })),
        special_request: l.specialRequest,
        line_total: centsToAmount(l.lineTotalCents),
      })),
      shipping_method: quote.shippingMethodName,
      shipping_cost: centsToAmount(quote.shippingCostCents),
      discount_code: quote.discount?.valid ? quote.discount.code : null,
      discount_amount: centsToAmount(quote.discountAmountCents),
      tax_amount: centsToAmount(quote.taxAmountCents),
      total: centsToAmount(quote.totalCents),
      currency: quote.currency,
      deposit_required: centsToAmount(quote.depositRequiredCents),
      amount_paid: 0,
      balance_due: centsToAmount(quote.totalCents),
      requires_approval: quote.requiresApproval,
      payment_status: 'pending',
      production_status: productionStatus,
    },
    accessToken,
  };
}
