// Hand-rolled Stripe webhook signature verification, reusing the same
// HMAC-SHA256 primitive as everywhere else in this codebase (lib/crypto.js)
// rather than pulling in the `stripe` SDK for this one check. Reimplements
// Stripe's documented scheme: the `Stripe-Signature` header carries
// `t=<unix ts>,v1=<hex hmac>[,v0=...]`; the signed payload is
// `${t}.${rawBody}`, HMAC-SHA256'd with the webhook signing secret.
import { hmacSha256Hex, constantTimeEqualHex } from './crypto.js';

const DEFAULT_TOLERANCE_SECONDS = 300;

export class WebhookSignatureError extends Error {}

function parseSignatureHeader(header) {
  const parts = {};
  for (const segment of (header || '').split(',')) {
    const eq = segment.indexOf('=');
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (key === 'v1') (parts.v1 ||= []).push(value);
    else if (key === 't') parts.t = value;
  }
  return parts;
}

// Verifies against the RAW request body text (not re-serialized JSON) --
// signature computation is byte-sensitive. Throws WebhookSignatureError on
// any failure (missing header, no matching v1, timestamp outside
// tolerance); returns nothing on success.
export async function verifyStripeSignature(rawBody, signatureHeader, secret, { toleranceSeconds = DEFAULT_TOLERANCE_SECONDS } = {}) {
  if (!secret) throw new WebhookSignatureError('Webhook signing secret is not configured.');
  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || !v1 || v1.length === 0) throw new WebhookSignatureError('Missing or malformed Stripe-Signature header.');

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) {
    throw new WebhookSignatureError('Stripe-Signature timestamp is outside the allowed tolerance.');
  }

  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  const matches = v1.some((sig) => constantTimeEqualHex(sig, expected));
  if (!matches) throw new WebhookSignatureError('Stripe-Signature does not match the computed signature.');
}
