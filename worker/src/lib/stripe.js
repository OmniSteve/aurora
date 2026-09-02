// Raw fetch-based Stripe REST client -- no `stripe` npm SDK, consistent with
// this codebase's dependency-minimal style (see lib/email.js for the same
// pattern against Resend). Stripe's API accepts application/x-www-form-urlencoded
// bodies with PHP-style bracket notation for nested objects
// (metadata[order_id]=...); toFormBody() implements just enough of that for
// the shapes used here (flat fields, one level of nested object, one level
// of array-of-objects for refund/payment-method-type lists).
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function appendFormValue(params, key, value) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => appendFormValue(params, `${key}[${i}]`, v));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) appendFormValue(params, `${key}[${k}]`, v);
  } else {
    params.append(key, String(value));
  }
}

export function toFormBody(body) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body || {})) appendFormValue(params, key, value);
  return params;
}

export class StripeApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Stripe API error (${status})`);
    this.status = status;
    this.stripeCode = body?.error?.code;
    this.stripeType = body?.error?.type;
  }
}

// idempotencyKey is required for every mutating call this Worker makes to
// Stripe -- see services/paymentService.js for how it's derived per (order,
// payment purpose, attempt). Not required for GET/retrieve.
export async function stripeRequest(env, method, path, { body, idempotencyKey } = {}) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  const headers = { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  let requestBody;
  if (body !== undefined) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    requestBody = toFormBody(body);
  }

  const response = await fetch(`${STRIPE_API_BASE}${path}`, { method, headers, body: requestBody });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new StripeApiError(response.status, json);
  return json;
}

export function createPaymentIntent(env, { amountCents, currency, metadata, automaticPaymentMethods = true }, idempotencyKey) {
  return stripeRequest(env, 'POST', '/payment_intents', {
    idempotencyKey,
    body: {
      amount: amountCents,
      currency,
      metadata,
      ...(automaticPaymentMethods ? { 'automatic_payment_methods[enabled]': 'true' } : {}),
    },
  });
}

export function retrievePaymentIntent(env, paymentIntentId) {
  return stripeRequest(env, 'GET', `/payment_intents/${encodeURIComponent(paymentIntentId)}`);
}

export function cancelPaymentIntent(env, paymentIntentId, idempotencyKey) {
  return stripeRequest(env, 'POST', `/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`, { idempotencyKey });
}

export function createRefund(env, { paymentIntentId, amountCents, reason }, idempotencyKey) {
  return stripeRequest(env, 'POST', '/refunds', {
    idempotencyKey,
    body: {
      payment_intent: paymentIntentId,
      ...(amountCents != null ? { amount: amountCents } : {}),
      ...(reason ? { reason } : {}),
    },
  });
}
