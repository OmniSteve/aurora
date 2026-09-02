import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { NotFoundError } from '../lib/http.js';
import { getCookie, buildCookie } from '../lib/cookies.js';
import { sha256Hex, randomToken } from '../lib/crypto.js';
import { requireCsrf, SESSION_COOKIE as AUTH_SESSION_COOKIE } from '../lib/authGuard.js';
import { withIdempotency } from '../lib/idempotency.js';
import { enforceRateLimit, getClientIp } from '../lib/rateLimit.js';
import { createOrder } from '../services/checkoutService.js';
import { quoteSchema } from './checkout.js';

const CHECKOUT_COOKIE = 'aurora_checkout';
const CHECKOUT_COOKIE_TTL_SECONDS = 60 * 60;

const addressSchema = z
  .object({
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    postcode: z.string().max(20).optional(),
    country: z.string().max(100).optional(),
  })
  .optional();

const orderSchema = quoteSchema.extend({
  customer_name: z.string().max(200).optional(),
  email: z.string().trim().email().max(320),
  phone: z.string().max(50).optional(),
  shipping_address: addressSchema,
  billing_address: addressSchema,
});

// Resolves who "owns" this checkout attempt, for idempotency-key binding
// (instruction #9) -- a signed-in customer's session, or (the common case:
// Aurora allows anonymous checkout) a lightweight, non-authenticating
// correlator cookie minted on first use. Neither path is used for
// anything beyond "does a retry belong to the same caller as the
// original" -- it grants no access on its own.
async function resolveCheckoutOwner(ctx) {
  const sessionToken = getCookie(ctx.request, AUTH_SESSION_COOKIE);
  if (sessionToken) {
    const tokenHash = await sha256Hex(sessionToken);
    const session = await ctx.repositories.sessions.findActiveByTokenHash(tokenHash);
    if (session) {
      return { userId: session.user_id, ownerTokenHash: tokenHash, session, setCookies: [] };
    }
  }

  let checkoutToken = getCookie(ctx.request, CHECKOUT_COOKIE);
  const setCookies = [];
  if (!checkoutToken) {
    checkoutToken = randomToken(24);
    setCookies.push(buildCookie(CHECKOUT_COOKIE, checkoutToken, { maxAgeSeconds: CHECKOUT_COOKIE_TTL_SECONDS, httpOnly: true }));
  }
  return { userId: null, ownerTokenHash: await sha256Hex(checkoutToken), session: null, setCookies };
}

function formatOrderRow(order, items) {
  return {
    id: order.id,
    order_number: order.order_number,
    customer_name: order.customer_name,
    email: order.email,
    items: items.map((it) => ({
      name: it.name,
      sku: it.sku,
      quantity: it.quantity,
      options: it.options_json ? JSON.parse(it.options_json) : {},
      customizations: it.customizations_json ? JSON.parse(it.customizations_json) : [],
      special_request: it.special_request_json ? JSON.parse(it.special_request_json) : null,
      line_total: it.line_total_cents / 100,
    })),
    shipping_method: order.shipping_method,
    shipping_cost: order.shipping_cost_cents / 100,
    discount_code: order.discount_code,
    discount_amount: order.discount_amount_cents / 100,
    tax_amount: order.tax_amount_cents / 100,
    total: order.total_cents / 100,
    currency: order.currency,
    deposit_required: order.deposit_required_cents / 100,
    amount_paid: order.amount_paid_cents / 100,
    balance_due: order.balance_due_cents / 100,
    requires_approval: !!order.requires_approval,
    payment_status: order.payment_status,
    production_status: order.production_status,
  };
}

export function registerOrderRoutes(router) {
  router.post('/api/orders', async (ctx) => {
    const body = await parseJsonBody(ctx.request, orderSchema);
    const idempotencyKey = ctx.request.headers.get('idempotency-key');

    const owner = await resolveCheckoutOwner(ctx);
    // Set unconditionally, before anything that can throw: a freshly-minted
    // anonymous checkout cookie must reach the caller even if this request
    // fails (validation, insufficient stock, ...), or a retry can never be
    // recognised as the same caller for idempotency purposes.
    ctx.extraCookies = owner.setCookies;
    if (owner.session) await requireCsrf(ctx, owner.session);

    await enforceRateLimit(ctx, {
      action: 'order-create',
      identifier: owner.ownerTokenHash,
      limit: 10,
      windowSeconds: 600,
      cfBinding: ctx.env.RL_PUBLIC,
      cfKey: getClientIp(ctx.request),
    });

    const result = await withIdempotency(ctx, {
      key: idempotencyKey,
      scope: 'checkout',
      body,
      ownerTokenHash: owner.ownerTokenHash,
      userId: owner.userId,
      execute: () => createOrder(ctx, { ...body, userId: owner.userId, idempotencyKey }),
    });

    return ctx.json(result, 201);
  });

  // Ownership-gated: session match, or the opaque access token minted at
  // creation (?token=...) -- never the order id alone (instruction #12).
  router.get('/api/orders/:id', async (ctx) => {
    let userId = null;
    const sessionToken = getCookie(ctx.request, AUTH_SESSION_COOKIE);
    if (sessionToken) {
      const tokenHash = await sha256Hex(sessionToken);
      const session = await ctx.repositories.sessions.findActiveByTokenHash(tokenHash);
      if (session) userId = session.user_id;
    }
    const presentedToken = ctx.url.searchParams.get('token');
    const accessTokenHash = presentedToken ? await sha256Hex(presentedToken) : null;

    const result = await ctx.repositories.orders.findForAccess(ctx.params.id, { userId, accessTokenHash });
    if (!result) throw new NotFoundError('Order not found');

    return ctx.json({ order: formatOrderRow(result.order, result.items) });
  });
}
