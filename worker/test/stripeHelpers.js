// Test-only Stripe mocking. Aurora never calls the real Stripe API from
// vitest-pool-workers' Miniflare runtime (test mode or not) -- these spy on
// worker/src/lib/stripe.js's exports the same way helpers.js's
// registerAndVerify spies on lib/email.js's sendEmail, and paymentService.js
// imports/calls these exact named exports, so the spy is visible to it.
import { vi } from 'vitest';
import * as stripeLib from '../src/lib/stripe.js';

let seq = 0;
export function fakePaymentIntentId() {
  return `pi_test_${Date.now()}_${seq++}`;
}
export function fakeClientSecret(id) {
  return `${id}_secret_test`;
}

// In-memory Stripe-shaped store so retrievePaymentIntent reflects whatever
// createPaymentIntent (or a test) last set, without a real Stripe account.
export function mockStripe() {
  const intents = new Map();

  function makeIntent({ id, amount, currency, metadata, status = 'requires_payment_method' }) {
    const intent = { id, object: 'payment_intent', amount, amount_received: status === 'succeeded' ? amount : 0, currency, metadata, status, client_secret: fakeClientSecret(id), latest_charge: status === 'succeeded' ? `ch_test_${id}` : null };
    intents.set(id, intent);
    return intent;
  }

  const createPaymentIntent = vi.spyOn(stripeLib, 'createPaymentIntent').mockImplementation(async (_env, { amountCents, currency, metadata }) => {
    const id = fakePaymentIntentId();
    return makeIntent({ id, amount: amountCents, currency, metadata, status: 'requires_payment_method' });
  });

  const retrievePaymentIntent = vi.spyOn(stripeLib, 'retrievePaymentIntent').mockImplementation(async (_env, id) => {
    const intent = intents.get(id);
    if (!intent) throw new Error(`No fake intent for ${id}`);
    return intent;
  });

  const cancelPaymentIntent = vi.spyOn(stripeLib, 'cancelPaymentIntent').mockImplementation(async (_env, id) => {
    const intent = intents.get(id);
    if (!intent) throw new Error(`No fake intent for ${id}`);
    intent.status = 'canceled';
    return intent;
  });

  const createRefund = vi.spyOn(stripeLib, 'createRefund').mockImplementation(async (_env, { paymentIntentId, amountCents }) => {
    const id = `re_test_${Date.now()}_${seq++}`;
    return { id, object: 'refund', amount: amountCents, payment_intent: paymentIntentId, status: 'succeeded' };
  });

  return {
    createPaymentIntent,
    retrievePaymentIntent,
    cancelPaymentIntent,
    createRefund,
    // Test-side helpers to move a fake intent into a state the createXxx
    // spies wouldn't naturally reach (simulating a webhook having fired, or
    // a customer completing/abandoning the Payment Element).
    setStatus(id, status) {
      const intent = intents.get(id);
      intent.status = status;
      if (status === 'succeeded') intent.amount_received = intent.amount;
    },
    getIntent(id) {
      return intents.get(id);
    },
    restore() {
      createPaymentIntent.mockRestore();
      retrievePaymentIntent.mockRestore();
      cancelPaymentIntent.mockRestore();
      createRefund.mockRestore();
    },
  };
}

// Builds a Stripe-shaped webhook event envelope and signs it exactly the
// way worker/src/lib/stripeWebhook.js verifies it, for tests that POST
// straight to /api/webhooks/stripe.
export async function signedWebhookPayload(secret, { type, data, id }) {
  const event = { id: id || `evt_test_${Date.now()}_${seq++}`, type, data: { object: data }, object: 'event' };
  const rawBody = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const { hmacSha256Hex } = await import('../src/lib/crypto.js');
  const sig = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return { rawBody, header: `t=${t},v1=${sig}`, event };
}
