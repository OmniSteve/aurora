// Thin Resend wrapper. No Aurora domain is verified in Resend yet (only
// ppgk.app exists, from an unrelated project) -- per Phase 4 instructions,
// DNS/domain setup is out of scope here, so dev sends use Resend's
// `onboarding@resend.dev` sandbox sender (env.EMAIL_FROM), which works
// without any domain verification. Swap EMAIL_FROM once a real domain is
// configured; nothing else here changes.
//
// Development guardrail: only ever sends to env.DEV_EMAIL_RECIPIENT_ALLOWLIST
// (comma-separated) if it's set, so real imported Base44 user addresses
// can never receive mail from Phase 4 testing (that's Phase 5/cutover's
// job, deliberately not this one's).
const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendEmail(env, { to, subject, html, requestId }) {
  const allowlist = parseAllowlist(env.DEV_EMAIL_RECIPIENT_ALLOWLIST);
  if (allowlist && !allowlist.includes(to.toLowerCase())) {
    console.log(JSON.stringify({
      requestId,
      scope: 'email_blocked_by_dev_allowlist',
      to: redactEmail(to),
    }));
    return { sent: false, reason: 'recipient_not_in_dev_allowlist' };
  }

  if (!env.RESEND_API_KEY) {
    console.error(JSON.stringify({ requestId, scope: 'email_send_skipped', reason: 'RESEND_API_KEY not configured' }));
    return { sent: false, reason: 'not_configured' };
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
  });

  if (!response.ok) {
    // Never log the API key or full response body (could echo request
    // content back); log just enough to diagnose a delivery problem.
    console.error(JSON.stringify({ requestId, scope: 'email_send_failed', status: response.status }));
    return { sent: false, reason: 'provider_error' };
  }

  console.log(JSON.stringify({ requestId, scope: 'email_sent', to: redactEmail(to) }));
  return { sent: true };
}

export function otpEmail(code) {
  return {
    subject: 'Your Aurora verification code',
    html: `<p>Your verification code is:</p><p style="font-size:24px;font-weight:600;letter-spacing:4px;">${escapeHtml(code)}</p><p>This code expires shortly and can only be used once.</p>`,
  };
}

export function passwordResetEmail(resetUrl) {
  return {
    subject: 'Reset your Aurora password',
    html: `<p>Someone requested a password reset for this email address.</p><p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p><p>If you didn't request this, you can ignore this email.</p>`,
  };
}

// amountCents/currency describe what was actually charged (from the
// succeeded Stripe PaymentIntent, never a client-supplied figure).
export function orderConfirmationEmail({ orderNumber, amountCents, currency, isDeposit, balanceDueCents, confirmationUrl }) {
  const amount = formatMoney(amountCents, currency);
  const balanceLine = isDeposit && balanceDueCents > 0
    ? `<p>Your deposit of ${amount} has been received. A balance of ${formatMoney(balanceDueCents, currency)} remains, and we'll be in touch when it's due.</p>`
    : `<p>Your payment of ${amount} has been received in full.</p>`;
  const linkLine = confirmationUrl ? `<p><a href="${escapeHtml(confirmationUrl)}">View your order</a></p>` : '';
  return {
    subject: `Payment confirmed — order ${orderNumber}`,
    html: `<p>Thank you — your order <strong>${escapeHtml(orderNumber)}</strong> is confirmed.</p>${balanceLine}${linkLine}`,
  };
}

export function orderAwaitingApprovalEmail({ orderNumber, confirmationUrl }) {
  return {
    subject: `Order received — ${orderNumber}`,
    html: `<p>Thank you — we've received your order <strong>${escapeHtml(orderNumber)}</strong>.</p><p>It includes a special request, so our atelier will review it before any payment is taken. We'll be in touch shortly.</p><p><a href="${escapeHtml(confirmationUrl)}">View your order</a></p>`,
  };
}

// amountCents is the amount actually refunded by Stripe on this request
// (never assumed to be the order's full original total -- a partial refund
// gets its own, smaller figure here).
export function refundConfirmationEmail({ orderNumber, amountCents, currency }) {
  return {
    subject: `Refund issued — order ${orderNumber}`,
    html: `<p>A refund of ${formatMoney(amountCents, currency)} has been issued for your order <strong>${escapeHtml(orderNumber)}</strong>.</p><p>Please allow a few business days for it to appear back in your account, depending on your bank or card provider.</p>`,
  };
}

export function balanceRequestEmail({ orderNumber, balanceDueCents, currency, payUrl }) {
  return {
    subject: `Balance payment due — order ${orderNumber}`,
    html: `<p>Your order <strong>${escapeHtml(orderNumber)}</strong> is ready for its final payment of ${formatMoney(balanceDueCents, currency)}.</p><p><a href="${escapeHtml(payUrl)}">Pay the remaining balance securely</a></p>`,
  };
}

export function bespokeAcknowledgementEmail({ customerName }) {
  return {
    subject: 'We’ve received your bespoke commission request',
    html: `<p>Thank you, ${escapeHtml(customerName || '')} — we've received your bespoke commission request.</p><p>Our designers will review your vision and reply within two working days with next steps and, where possible, an initial quote.</p>`,
  };
}

function formatMoney(cents, currency = 'GBP') {
  const amount = (cents / 100).toFixed(2);
  const symbol = currency?.toUpperCase() === 'GBP' ? '£' : `${currency?.toUpperCase() || ''} `;
  return `${symbol}${amount}`;
}

function parseAllowlist(value) {
  if (!value) return null;
  return value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Never log a full email address -- just enough to spot the right test
// account in logs without printing PII wholesale.
function redactEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
