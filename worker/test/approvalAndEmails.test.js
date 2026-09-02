import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { call, env, cleanupUser, registerAndVerify, extractAuthCookies } from './helpers.js';
import { seedCategory, seedProduct, seedSpecialRequest, seedSettings, cleanupProduct, cleanupOrder } from './commerceHelpers.js';
import { mockStripe, signedWebhookPayload } from './stripeHelpers.js';
import worker from '../src/index.js';

const WEBHOOK_SECRET = () => env.STRIPE_WEBHOOK_SECRET;

beforeAll(async () => {
  await seedCategory('cat_test');
  await seedSettings();
});

function idem() {
  return crypto.randomUUID();
}

async function adminAuth(email) {
  await cleanupUser(email);
  const { cookies } = await registerAndVerify(email, 'correct horse battery staple');
  await env.DB.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).bind(email).run();
  return extractAuthCookies(cookies);
}

function authedCall(auth, path, opts = {}) {
  return call(path, {
    ...opts,
    cookies: { aurora_session: auth.session, aurora_csrf: auth.csrf, ...(opts.cookies || {}) },
    headers: { 'x-csrf-token': auth.csrf, ...(opts.headers || {}) },
  });
}

async function postRawWebhook(rawBody, header) {
  const response = await worker.fetch(
    new Request('https://example.com/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': header, 'content-type': 'application/json', 'cf-connecting-ip': crypto.randomUUID() },
      body: rawBody,
    }),
    env,
  );
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function cleanupEvent(id) {
  await env.DB.prepare(`DELETE FROM stripe_events WHERE id = ?`).bind(id).run();
}

describe('approval-required order workflow', () => {
  let stripe;
  beforeEach(() => { stripe = mockStripe(); });
  afterEach(() => { stripe.restore(); });

  it('appears in the admin order list with requires_approval, and cannot get a PaymentIntent while unapproved', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    await seedSpecialRequest(productId, { enabled: true, paymentBehaviour: 'approval' });
    const emailLib = await import('../src/lib/email.js');
    const spy = vi.spyOn(emailLib, 'sendEmail').mockResolvedValue({ sent: true });

    const { json: orderJson } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1, special_request: { text: 'Please make it bigger' } }], email: 'approval-flow@example.com' },
    });
    expect(orderJson.order.requires_approval).toBe(true);
    // "order received / awaiting approval" email -- no payment taken yet.
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();

    const blocked = await call(`/api/orders/${orderJson.order.id}/payment-intent?token=${orderJson.accessToken}`, { method: 'POST' });
    expect(blocked.status).toBe(403);

    const auth = await adminAuth('admin-approval@example.com');
    const list = await authedCall(auth, '/api/admin/orders');
    const listed = list.json.orders.find((o) => o.id === orderJson.order.id);
    expect(listed.requires_approval).toBe(true);
    expect(listed.production_status).toBe('awaiting_approval');

    await cleanupOrder(orderJson.order.id);
    await cleanupProduct(productId);
  });

  it('an approved order (with a confirmed amount) becomes payable through the normal Stripe path', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    await seedSpecialRequest(productId, { enabled: true, paymentBehaviour: 'approval' });
    const { json: orderJson } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1, special_request: { text: 'Custom engraving' } }], email: 'approval-payable@example.com' },
    });

    const auth = await adminAuth('admin-approve@example.com');
    const approved = await authedCall(auth, `/api/admin/orders/${orderJson.order.id}/approve`, { method: 'POST', body: { amount: 150 } });
    expect(approved.status).toBe(200);
    expect(approved.json.order.requires_approval).toBe(false);
    expect(approved.json.order.production_status).toBe('awaiting_payment');
    expect(approved.json.order.total).toBe(150); // confirmed/overridden amount, not the original 100

    const intent = await call(`/api/orders/${orderJson.order.id}/payment-intent?token=${orderJson.accessToken}`, { method: 'POST' });
    expect(intent.status).toBe(200);
    expect(intent.json.amount).toBe(150); // charged from the authoritative stored (approved) amount
    expect(stripe.createPaymentIntent).toHaveBeenCalledTimes(1);

    await cleanupOrder(orderJson.order.id);
    await cleanupProduct(productId);
  });

  it('a rejected order is cancelled and never becomes payable', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    await seedSpecialRequest(productId, { enabled: true, paymentBehaviour: 'approval' });
    const { json: orderJson } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1, special_request: { text: 'Not feasible' } }], email: 'approval-reject@example.com' },
    });

    const auth = await adminAuth('admin-reject@example.com');
    const rejected = await authedCall(auth, `/api/admin/orders/${orderJson.order.id}/reject`, { method: 'POST' });
    expect(rejected.json.order.production_status).toBe('cancelled');

    const intent = await call(`/api/orders/${orderJson.order.id}/payment-intent?token=${orderJson.accessToken}`, { method: 'POST' });
    expect(intent.status).toBe(400); // already paid/cancelled, not approval-blocked -- payment_status is 'cancelled'

    await cleanupOrder(orderJson.order.id);
    await cleanupProduct(productId);
  });
});

describe('order confirmation email on payment success', () => {
  let stripe;
  beforeEach(() => { stripe = mockStripe(); });
  afterEach(() => { stripe.restore(); });

  it('is sent exactly once, even when the webhook is delivered twice', async () => {
    const productId = await seedProduct({ priceCents: 10000, stockQuantity: 5 });
    const { json: orderJson } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'confirm-email@example.com' },
    });
    await call(`/api/orders/${orderJson.order.id}/payment-intent?token=${orderJson.accessToken}`, { method: 'POST' });
    const intentId = (await env.DB.prepare(`SELECT stripe_payment_intent_id FROM orders WHERE id = ?`).bind(orderJson.order.id).first()).stripe_payment_intent_id;
    stripe.setStatus(intentId, 'succeeded');

    const emailLib = await import('../src/lib/email.js');
    const sent = [];
    const spy = vi.spyOn(emailLib, 'sendEmail').mockImplementation(async (_env, opts) => { sent.push(opts); return { sent: true }; });

    const { rawBody, header, event } = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.succeeded', data: stripe.getIntent(intentId), id: 'evt_email_dedup' });
    const first = await postRawWebhook(rawBody, header);
    const second = await postRawWebhook(rawBody, header); // duplicate delivery of the same event id
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.json.duplicate).toBe(true);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('confirm-email@example.com');
    expect(sent[0].subject).toMatch(/Payment confirmed/);

    spy.mockRestore();
    await cleanupEvent(event.id);
    await cleanupOrder(orderJson.order.id);
    await cleanupProduct(productId);
  });
});

describe('admin balance-payment request', () => {
  let stripe;
  beforeEach(() => { stripe = mockStripe(); });
  afterEach(() => { stripe.restore(); });

  it('emails a working payment link for exactly the outstanding balance', async () => {
    const productId = await seedProduct({ priceCents: 10000, stockQuantity: 5 });
    const { seedDeposit } = await import('./commerceHelpers.js');
    await seedDeposit(productId, { enabled: true, type: 'percentage', value: 30 });
    const { json: orderJson } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'balance-request@example.com' },
    });
    await call(`/api/orders/${orderJson.order.id}/payment-intent?token=${orderJson.accessToken}`, { method: 'POST' });
    const intentId = (await env.DB.prepare(`SELECT stripe_payment_intent_id FROM orders WHERE id = ?`).bind(orderJson.order.id).first()).stripe_payment_intent_id;
    stripe.setStatus(intentId, 'succeeded');
    const { rawBody, header, event } = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.succeeded', data: stripe.getIntent(intentId) });
    await postRawWebhook(rawBody, header);

    const dbOrder = await env.DB.prepare(`SELECT payment_status, balance_due_cents FROM orders WHERE id = ?`).bind(orderJson.order.id).first();
    expect(dbOrder.payment_status).toBe('deposit_paid');
    expect(dbOrder.balance_due_cents).toBe(7000);

    // adminAuth() -> registerAndVerify() installs and restores its own
    // sendEmail spy internally, so it must run *before* this test's own spy
    // goes up, or that internal restore would clobber it.
    const auth = await adminAuth('admin-balance-request@example.com');

    const emailLib = await import('../src/lib/email.js');
    const sent = [];
    const spy = vi.spyOn(emailLib, 'sendEmail').mockImplementation(async (_env, opts) => { sent.push(opts); return { sent: true }; });

    const requested = await authedCall(auth, `/api/admin/orders/${orderJson.order.id}/request-balance`, { method: 'POST' });
    expect(requested.status).toBe(200);
    expect(sent).toHaveLength(1);
    const linkMatch = sent[0].html.match(/href="([^"]+)"/);
    expect(linkMatch).toBeTruthy();
    spy.mockRestore();

    // The emailed link (a *newly*-minted access token -- the checkout-time
    // one is unrecoverable) actually works and returns the real balance.
    const url = new URL(linkMatch[1]);
    const payResponse = await call(`/api/orders/${orderJson.order.id}/payment-intent${url.search}`, { method: 'POST' });
    expect(payResponse.status).toBe(200);
    expect(payResponse.json.amount).toBe(70);
    expect(payResponse.json.purpose).toBe('balance');

    await cleanupEvent(event.id);
    await cleanupOrder(orderJson.order.id);
    await cleanupProduct(productId);
  });

  it('refuses to request a balance when nothing is outstanding', async () => {
    const productId = await seedProduct({ priceCents: 10000 });
    const { json: orderJson } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'no-balance@example.com' },
    });
    const auth = await adminAuth('admin-no-balance@example.com');
    const { status } = await authedCall(auth, `/api/admin/orders/${orderJson.order.id}/request-balance`, { method: 'POST' });
    expect(status).toBe(400);
    await cleanupOrder(orderJson.order.id);
    await cleanupProduct(productId);
  });
});

describe('refunds are visible in the admin order view', () => {
  let stripe;
  beforeEach(() => { stripe = mockStripe(); });
  afterEach(() => { stripe.restore(); });

  it('a succeeded refund shows up in the order payments timeline via GET /api/admin/orders/:id', async () => {
    const productId = await seedProduct({ priceCents: 10000, stockQuantity: 5 });
    const { json: orderJson } = await call('/api/orders', {
      method: 'POST',
      headers: { 'idempotency-key': idem() },
      body: { items: [{ product_id: productId, quantity: 1 }], email: 'refund-visible@example.com' },
    });
    await call(`/api/orders/${orderJson.order.id}/payment-intent?token=${orderJson.accessToken}`, { method: 'POST' });
    const intentId = (await env.DB.prepare(`SELECT stripe_payment_intent_id FROM orders WHERE id = ?`).bind(orderJson.order.id).first()).stripe_payment_intent_id;
    stripe.setStatus(intentId, 'succeeded');
    const { rawBody, header, event } = await signedWebhookPayload(WEBHOOK_SECRET(), { type: 'payment_intent.succeeded', data: stripe.getIntent(intentId) });
    await postRawWebhook(rawBody, header);

    const auth = await adminAuth('admin-refund-visible@example.com');
    await authedCall(auth, `/api/admin/orders/${orderJson.order.id}/refund`, { method: 'POST', body: { amount: 40 } });

    const detail = await authedCall(auth, `/api/admin/orders/${orderJson.order.id}`);
    const refundRow = detail.json.order.payments.find((p) => p.type === 'refund');
    expect(refundRow).toBeTruthy();
    expect(refundRow.amount).toBe(40);
    expect(refundRow.status).toBe('succeeded');
    expect(detail.json.order.payment_status).toBe('partially_refunded');
    // No Stripe secret/internal fields leaked.
    expect(JSON.stringify(detail.json)).not.toMatch(/sk_test|whsec_/);

    await cleanupEvent(event.id);
    await cleanupOrder(orderJson.order.id);
    await cleanupProduct(productId);
  });
});
