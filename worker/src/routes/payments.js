// Customer-facing payment endpoints. Order access uses the exact same
// ownership rule as GET /api/orders/:id (routes/orders.js) -- session match
// or the opaque access token minted at order creation -- so "pay for this
// order" never becomes a second way to read/act on an order the caller
// doesn't own.
import { getCookie } from '../lib/cookies.js';
import { sha256Hex } from '../lib/crypto.js';
import { SESSION_COOKIE as AUTH_SESSION_COOKIE } from '../lib/authGuard.js';
import { NotFoundError } from '../lib/http.js';
import { enforceRateLimit, getClientIp } from '../lib/rateLimit.js';
import { createOrRetrievePaymentIntent } from '../services/paymentService.js';
import { centsToAmount } from '../lib/money.js';

async function loadOwnedOrder(ctx) {
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
  return result.order;
}

export function registerPaymentRoutes(router) {
  // Creates (or reuses) the PaymentIntent for whatever this order currently
  // owes -- the initial due-now amount, or a later balance payment, decided
  // entirely from server-held order state (services/paymentService.js).
  // Idempotent by design: a refresh/retry never creates a second intent for
  // the same attempt (instruction #11).
  router.post('/api/orders/:id/payment-intent', async (ctx) => {
    const order = await loadOwnedOrder(ctx);

    await enforceRateLimit(ctx, {
      action: 'payment-intent-create',
      identifier: order.id,
      limit: 20,
      windowSeconds: 600,
      cfBinding: ctx.env.RL_PUBLIC,
      cfKey: getClientIp(ctx.request),
    });

    const result = await createOrRetrievePaymentIntent(ctx, order);
    return ctx.json({
      client_secret: result.clientSecret,
      amount: centsToAmount(result.amountCents),
      currency: result.currency,
      purpose: result.purpose,
      status: result.status,
    });
  });
}
