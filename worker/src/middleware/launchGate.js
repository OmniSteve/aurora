import { jsonResponse } from '../lib/http.js';
import { comingSoonHtml } from '../lib/comingSoon.js';

// Temporary pre-launch safety gate. See Phase 10C-2 launch-gate change:
// customers must not be able to create accounts, orders, bespoke requests,
// newsletter subscriptions or payments on the public custom domain until
// the site is explicitly launched. Scoped to the custom domain only --
// aurora-api.omni-design.workers.dev must stay fully usable for controlled
// production testing regardless of SITE_LAUNCHED.
//
// To remove at launch: set SITE_LAUNCHED=true in env.production.vars (or
// delete this file's call site in index.js once the gate is no longer
// needed at all).
const LAUNCH_GATE_HOSTNAME = 'auroracreations.uk';

// Public, state-changing customer-facing endpoints blocked pre-launch --
// even when called directly, not just via the React UI.
const BLOCKED_MUTATIONS = [
  { method: 'POST', pattern: /^\/api\/auth\/register$/ },
  { method: 'POST', pattern: /^\/api\/auth\/verify-email$/ },
  { method: 'POST', pattern: /^\/api\/auth\/resend-verification$/ },
  { method: 'POST', pattern: /^\/api\/auth\/forgot-password$/ },
  { method: 'POST', pattern: /^\/api\/auth\/reset-password$/ },
  { method: 'POST', pattern: /^\/api\/newsletter\/subscribe$/ },
  { method: 'POST', pattern: /^\/api\/bespoke$/ },
  { method: 'POST', pattern: /^\/api\/uploads\/private$/ },
  { method: 'POST', pattern: /^\/api\/orders$/ },
  { method: 'POST', pattern: /^\/api\/orders\/[^/]+\/payment-intent$/ },
];

function isLaunchGateActive(env, url) {
  // Fail-safe: anything other than the literal string 'true' keeps the
  // gate active, so a missing/misconfigured var can't accidentally launch.
  return url.hostname === LAUNCH_GATE_HOSTNAME && env.SITE_LAUNCHED !== 'true';
}

export function launchGateResponse({ request, url, env }) {
  if (!isLaunchGateActive(env, url)) return null;

  const path = url.pathname;
  const method = request.method.toUpperCase();

  // Required exceptions -- must keep working even while gated.
  if (method === 'GET' && path === '/api/health') return null;
  if (method === 'POST' && path === '/api/webhooks/stripe') return null;

  if (BLOCKED_MUTATIONS.some((rule) => rule.method === method && rule.pattern.test(path))) {
    return jsonResponse({ error: 'launch_pending', message: 'Aurora Creations is preparing to launch.' }, 503);
  }

  // Normal browser navigation / static assets -- everything that isn't
  // /api/*, /media/* or /media-private/* -- gets the Coming Soon page
  // instead of the real SPA shell. Self-contained, so no further asset
  // requests are needed.
  if (!path.startsWith('/api/') && !path.startsWith('/media/') && !path.startsWith('/media-private/')) {
    return new Response(comingSoonHtml(), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // Any other /api/* (catalogue reads, etc.) or /media/* passes through
  // unchanged -- only the mutation list above and page navigation are gated.
  return null;
}
