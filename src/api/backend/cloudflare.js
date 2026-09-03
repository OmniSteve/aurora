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
    get: async (id) => (await apiFetch(`/api/admin/products/${encodeURIComponent(id)}`)).product,
    listAll: async () => (await apiFetch('/api/admin/products')).products,
    create: async (data) => (await apiFetch('/api/admin/products', { method: 'POST', body: data })).product,
    update: async (id, data) => (await apiFetch(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'PUT', body: data })).product,
    remove: (id) => apiFetch(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  categories: {
    listPublished: async () => (await apiFetch('/api/categories')).categories,
    listAll: async () => (await apiFetch('/api/admin/categories')).categories,
    create: async (data) => (await apiFetch('/api/admin/categories', { method: 'POST', body: data })).category,
    update: async (id, data) => (await apiFetch(`/api/admin/categories/${encodeURIComponent(id)}`, { method: 'PUT', body: data })).category,
    remove: (id) => apiFetch(`/api/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  collections: {
    listPublished: async () => (await apiFetch('/api/collections')).collections,
    listAll: async () => (await apiFetch('/api/admin/collections')).collections,
    create: async (data) => (await apiFetch('/api/admin/collections', { method: 'POST', body: data })).collection,
    update: async (id, data) => (await apiFetch(`/api/admin/collections/${encodeURIComponent(id)}`, { method: 'PUT', body: data })).collection,
    remove: (id) => apiFetch(`/api/admin/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
    get: async (id, accessToken) => (await apiFetch(`/api/orders/${encodeURIComponent(id)}${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''}`)).order,
    listAll: async () => (await apiFetch('/api/admin/orders')).orders,
    // Admin detail view -- distinct from get() above, which is
    // ownership-gated (session-owner or access token) for the customer-
    // facing order page and will 404 for an admin viewing someone else's
    // order. This hits /api/admin/orders/:id, gated by requireAdmin instead.
    getAdmin: async (id) => (await apiFetch(`/api/admin/orders/${encodeURIComponent(id)}`)).order,
    update: async (id, data) => (await apiFetch(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'PUT', body: data })).order,
    // Admin-only operational actions beyond the generic update() above --
    // see worker/src/routes/adminOrders.js. Money fields (amount_paid,
    // balance_due, payments[]) are never client-writable; they only change
    // through the real Stripe-driven paths in backend.payments.
    addNote: async (id, text) => (await apiFetch(`/api/admin/orders/${encodeURIComponent(id)}/notes`, { method: 'POST', body: { text } })).order,
    approve: async (id, amount) => (await apiFetch(`/api/admin/orders/${encodeURIComponent(id)}/approve`, { method: 'POST', body: { amount } })).order,
    reject: async (id) => (await apiFetch(`/api/admin/orders/${encodeURIComponent(id)}/reject`, { method: 'POST' })).order,
    requestBalance: (id) => apiFetch(`/api/admin/orders/${encodeURIComponent(id)}/request-balance`, { method: 'POST' }),
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
    create: async (data) => (await apiFetch('/api/bespoke', { method: 'POST', body: data })).request,
    listAll: async () => (await apiFetch('/api/admin/bespoke')).requests,
    update: async (id, data) => (await apiFetch(`/api/admin/bespoke/${encodeURIComponent(id)}`, { method: 'PUT', body: data })).request,
    addNote: async (id, text) => (await apiFetch(`/api/admin/bespoke/${encodeURIComponent(id)}/notes`, { method: 'POST', body: { text } })).request,
  },

  discounts: {
    listAll: async () => (await apiFetch('/api/admin/discounts')).discounts,
    create: async (data) => (await apiFetch('/api/admin/discounts', { method: 'POST', body: data })).discount,
    update: async (id, data) => (await apiFetch(`/api/admin/discounts/${encodeURIComponent(id)}`, { method: 'PUT', body: data })).discount,
    remove: (id) => apiFetch(`/api/admin/discounts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
    // Full-record admin view (email/phone/address/social/Stripe flags) --
    // distinct from the narrower public get() above. AdminSettings.jsx uses
    // this one so a save() never wipes fields the public endpoint withholds.
    getAdmin: async () => (await apiFetch('/api/admin/settings')).settings,
    save: async (data) => (await apiFetch('/api/admin/settings', { method: 'PUT', body: data })).settings,
  },

  newsletter: {
    subscribe: async (email) => (await apiFetch('/api/newsletter/subscribe', { method: 'POST', body: { email } })).subscriber,
    listAll: async () => (await apiFetch('/api/admin/newsletter')).subscribers,
  },

  users: {
    listAll: async () => (await apiFetch('/api/admin/users')).users,
  },

  // `private: true` routes anonymous reference-image uploads (bespoke,
  // checkout special requests) to the private bucket via a token-gated URL
  // (worker/src/routes/uploads.js) instead of the admin-only public
  // catalogue-image path (worker/src/routes/adminMedia.js) -- see
  // migration/MEDIA.md ("never return a permanently-public private-R2 URL").
  media: {
    upload: async (file, { private: isPrivate = false } = {}) => {
      const form = new FormData();
      form.append('file', file);
      const path = isPrivate ? '/api/uploads/private' : '/api/admin/media';
      const csrfToken = !isPrivate ? getCookie('aurora_csrf') : null;
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: form,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(payload?.message || `Upload failed (${response.status})`);
        error.code = payload?.error || 'unknown';
        error.status = response.status;
        throw error;
      }
      return payload.url;
    },
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
