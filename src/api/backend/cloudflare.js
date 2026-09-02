// CLOUDFLARE ADAPTER
// ---------------------------------------------------------------------------
// The ONLY place in the Aurora codebase that talks to the Worker's REST API.
// src/api/aurora.js and src/api/auth.js consume this module and expose
// Aurora-owned interfaces to the React application -- no React page or
// component calls fetch('/api/...') directly.
//
// Same-origin deployment (the Worker serves both the SPA and /api/*), so
// requests use relative paths and `credentials: 'include'` for the session
// cookie. Unsafe methods (POST/PUT/PATCH/DELETE) automatically carry an
// X-CSRF-Token header read from the non-HttpOnly `aurora_csrf` cookie the
// Worker sets alongside a session -- see worker/src/lib/authGuard.js
// (requireCsrf) for what it's checked against.
//
// An operation that hasn't been migrated yet fails explicitly (a thrown
// Error with a recognisable `.code`, e.g. 'not_implemented' or
// 'auth_required') rather than silently falling back to Base44 or pretending
// to succeed.
// ---------------------------------------------------------------------------

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function apiFetch(path, { method = 'GET', body, headers } = {}) {
  const csrfToken = UNSAFE_METHODS.has(method) ? getCookie('aurora_csrf') : null;

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // No body, or not JSON -- payload stays null.
  }

  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed (${response.status})`);
    error.code = payload?.error || 'unknown';
    error.status = response.status;
    error.details = payload?.details;
    throw error;
  }

  return payload;
}

function notImplemented(message) {
  return async () => {
    const error = new Error(message);
    error.code = 'not_implemented';
    throw error;
  };
}

// `aurora_has_session` is a non-HttpOnly UX hint only -- set/cleared
// alongside the real (HttpOnly) session cookie by the Worker. It is never
// treated as proof of anything here either: a forged copy of this cookie
// only ever causes an extra GET /api/auth/me, which the Worker will 401
// because it never trusts this cookie -- only the real session lookup.
function hasSessionCookie() {
  return getCookie('aurora_has_session') === '1';
}

export const backend = {
  products: {
    listPublished: async () => (await apiFetch('/api/products')).products,
    getBySlug: async (slug) => (await apiFetch(`/api/products/slug/${encodeURIComponent(slug)}`)).product,
    get: (id) => apiFetch(`/api/admin/products/${encodeURIComponent(id)}`),
    listAll: () => apiFetch('/api/admin/products'),
    create: (data) => apiFetch('/api/admin/products', { method: 'POST', body: data }),
    update: (id, data) => apiFetch(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
    remove: (id) => apiFetch(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  categories: {
    listPublished: async () => (await apiFetch('/api/categories')).categories,
    listAll: () => apiFetch('/api/admin/categories'),
  },

  collections: {
    listPublished: async () => (await apiFetch('/api/collections')).collections,
    listAll: () => apiFetch('/api/admin/collections'),
  },

  // Server-authoritative checkout (Phase 6). checkout.quote is a read-only
  // preview -- never trust it as input; orders.create recalculates
  // everything from scratch server-side regardless of what quote returned.
  checkout: {
    quote: (data) => apiFetch('/api/checkout/quote', { method: 'POST', body: data }),
  },

  orders: {
    // `idempotencyKey` should be one high-entropy value minted once per
    // checkout attempt (not per request) and reused across retries of that
    // same attempt -- see src/pages/Checkout.jsx.
    create: (data, idempotencyKey) =>
      apiFetch('/api/orders', { method: 'POST', body: data, headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {} }),
    // `accessToken` is the opaque, one-time token returned by orders.create
    // for an anonymous checkout -- required to view the order again (the
    // order id alone is not sufficient credential). See worker/src/routes/orders.js.
    get: (id, accessToken) => apiFetch(`/api/orders/${encodeURIComponent(id)}${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''}`),
    listAll: () => apiFetch('/api/admin/orders'),
    update: (id, data) => apiFetch(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  },

  // Stripe payment lifecycle (Phase 7). `accessToken` is the same
  // order-access credential as orders.get -- required for an anonymous
  // checkout, since the order id alone is never sufficient. The endpoint
  // itself decides initial-vs-balance and the amount due; nothing here
  // sends a price.
  payments: {
    createIntent: (orderId, accessToken) =>
      apiFetch(`/api/orders/${encodeURIComponent(orderId)}/payment-intent${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''}`, {
        method: 'POST',
      }),
    refund: (orderId, data) => apiFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/refund`, { method: 'POST', body: data }),
  },

  bespoke: {
    create: (data) => apiFetch('/api/bespoke', { method: 'POST', body: data }),
    listAll: () => apiFetch('/api/admin/bespoke'),
    update: (id, data) => apiFetch(`/api/admin/bespoke/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  },

  discounts: {
    listAll: () => apiFetch('/api/admin/discounts'),
    validate: (code, subtotal) => apiFetch('/api/discounts/validate', { method: 'POST', body: { code, subtotal } }),
    // No server route backs this on purpose -- Phase 6 redesigns redemption
    // around inventory-style reservations (worker/migrations/0004_discounts.sql),
    // folded into order creation rather than a standalone mark-used call.
    markUsed: notImplemented(
      'Discount redemption happens automatically during checkout in a later phase; there is no separate step to call.',
    ),
  },

  settings: {
    get: async () => (await apiFetch('/api/settings')).settings,
    save: (data) => apiFetch('/api/admin/settings', { method: 'PUT', body: data }),
  },

  newsletter: {
    subscribe: async (email) => (await apiFetch('/api/newsletter/subscribe', { method: 'POST', body: { email } })).subscriber,
    listAll: () => apiFetch('/api/admin/newsletter'),
  },

  users: {
    listAll: () => apiFetch('/api/admin/users'),
  },

  media: {
    // No server route backs this on purpose -- see the Phase 3 media
    // boundary notes in worker/src/repositories/mediaRepository.js.
    upload: notImplemented('Media upload is not available yet.'),
  },

  auth: {
    hasSession: () => hasSessionCookie(),
    // Aurora is a public storefront -- there is nothing to check yet, so
    // this resolves immediately with no network call, matching
    // migration/API_CONTRACT.md ("For a public storefront simply resolve").
    checkAppAccess: async () => ({}),
    me: async () => (await apiFetch('/api/auth/me')).user,
    loginWithPassword: async (email, password) => (await apiFetch('/api/auth/login', { method: 'POST', body: { email, password } })).user,
    // Full-page navigation, not a fetch -- the Worker issues a real 302 to
    // Google (GET /api/auth/google/start), which a fetch() call can't
    // follow the way a top-level navigation can.
    loginWithProvider: async (provider, returnTo) => {
      if (provider !== 'google') {
        const error = new Error(`Unsupported provider: ${provider}`);
        error.code = 'not_implemented';
        throw error;
      }
      window.location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo || '/')}`;
    },
    register: (data) => apiFetch('/api/auth/register', { method: 'POST', body: data }),
    verifyEmail: async (data) => (await apiFetch('/api/auth/verify-email', { method: 'POST', body: data })).user,
    resendVerification: (email) => apiFetch('/api/auth/resend-verification', { method: 'POST', body: { email } }),
    // Calls the server first (revokes the D1 session, clears all three
    // cookies) and navigates only after that settles -- best-effort if the
    // request fails, since the caller has usually already cleared local
    // UI state and navigating is still the right outcome either way.
    logout: async (redirectUrl) => {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // Best-effort: still navigate even if the network call failed.
      } finally {
        if (redirectUrl) window.location.href = redirectUrl;
        else window.location.reload();
      }
    },
    redirectToLogin: (nextUrl) => {
      window.location.href = `/login?returnTo=${encodeURIComponent(nextUrl)}`;
    },
    requestPasswordReset: (email) => apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: (data) => apiFetch('/api/auth/reset-password', { method: 'POST', body: data }),
  },
};
