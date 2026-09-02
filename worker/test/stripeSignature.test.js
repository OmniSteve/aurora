import { describe, it, expect } from 'vitest';
import { verifyStripeSignature, WebhookSignatureError } from '../src/lib/stripeWebhook.js';
import { hmacSha256Hex } from '../src/lib/crypto.js';

const SECRET = 'whsec_test_unit_secret';

async function sign(body, t = Math.floor(Date.now() / 1000)) {
  const sig = await hmacSha256Hex(SECRET, `${t}.${body}`);
  return `t=${t},v1=${sig}`;
}

describe('verifyStripeSignature', () => {
  it('accepts a correctly signed, fresh payload', async () => {
    const body = JSON.stringify({ id: 'evt_1' });
    await expect(verifyStripeSignature(body, await sign(body), SECRET)).resolves.toBeUndefined();
  });

  it('rejects a tampered body', async () => {
    const header = await sign(JSON.stringify({ id: 'evt_1' }));
    await expect(verifyStripeSignature(JSON.stringify({ id: 'evt_2' }), header, SECRET)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('rejects a timestamp outside the tolerance window', async () => {
    const body = JSON.stringify({ id: 'evt_1' });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 1000; // > default 300s tolerance
    await expect(verifyStripeSignature(body, await sign(body, staleTimestamp), SECRET)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('rejects a missing header', async () => {
    await expect(verifyStripeSignature('{}', null, SECRET)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('rejects when no signing secret is configured', async () => {
    const body = '{}';
    await expect(verifyStripeSignature(body, await sign(body), '')).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('accepts when the correct v1 is present alongside an unrelated/older one', async () => {
    const body = JSON.stringify({ id: 'evt_1' });
    const good = await sign(body);
    const header = `t=${good.split(',')[0].slice(2)},v1=deadbeef,v1=${good.split('v1=')[1]}`;
    await expect(verifyStripeSignature(body, header, SECRET)).resolves.toBeUndefined();
  });
});
