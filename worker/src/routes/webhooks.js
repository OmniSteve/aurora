// Stripe webhook receiver. Deliberately outside every other route's
// security model: no session, no CSRF (there is no ambient browser
// authority to forge here -- Stripe is a server calling us), no
// Idempotency-Key header (Stripe has its own retry/dedup semantics, see
// stripe_events below). The Stripe signature is the entire authentication
// boundary for this endpoint.
import { verifyStripeSignature, WebhookSignatureError } from '../lib/stripeWebhook.js';
import { processStripeEvent } from '../services/paymentService.js';
import { createStripeEventsRepository } from '../repositories/stripeEventsRepository.js';

export function registerWebhookRoutes(router) {
  router.post('/api/webhooks/stripe', async (ctx) => {
    // Raw body text, read before any JSON parsing -- Stripe's signature is
    // computed over the exact bytes it sent, not a re-serialization of them.
    const rawBody = await ctx.request.text();
    const signatureHeader = ctx.request.headers.get('stripe-signature');

    try {
      await verifyStripeSignature(rawBody, signatureHeader, ctx.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        console.error(JSON.stringify({ requestId: ctx.requestId, scope: 'stripe_webhook_signature_rejected', error: err.message }));
        return ctx.json({ error: 'invalid_signature', message: 'Signature verification failed.' }, 400);
      }
      throw err;
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return ctx.json({ error: 'invalid_payload', message: 'Body is not valid JSON.' }, 400);
    }

    const stripeEvents = createStripeEventsRepository(ctx.env.DB);
    const begun = await stripeEvents.begin({ id: event.id, type: event.type, payload: rawBody });

    if (!begun.isNew && begun.status === 'processed') {
      // True duplicate delivery of an event we already fully applied --
      // acknowledge without repeating any side effect.
      return ctx.json({ received: true, duplicate: true });
    }
    // begun.isNew, or a prior 'received'/'failed' attempt that never
    // completed -- process (or reprocess) it. processStripeEvent's own
    // mutations are independently idempotent (order_payments existence
    // check, CAS-guarded reservation updates), so reprocessing here is safe
    // even if it races a still-in-flight original attempt.

    try {
      await processStripeEvent(ctx, event);
      await stripeEvents.markProcessed(event.id);
      return ctx.json({ received: true });
    } catch (err) {
      // Never mark this event permanently processed when the Aurora-side
      // mutation failed -- leaving it 'failed' means the next Stripe retry
      // of this same event id is treated as reprocessable, not a duplicate.
      await stripeEvents.markFailed(event.id, err?.stack || err);
      console.error(JSON.stringify({ requestId: ctx.requestId, scope: 'stripe_webhook_processing_failed', eventId: event.id, error: String(err?.stack || err) }));
      return ctx.json({ error: 'processing_failed', message: 'Could not process this event.' }, 500);
    }
  });
}
