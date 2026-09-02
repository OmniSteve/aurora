// CLOUDFLARE ADAPTER
// ---------------------------------------------------------------------------
// The ONLY place in the Aurora codebase that talks to the Worker's REST API.
// src/api/aurora.js and src/api/auth.js consume this module and expose
// Aurora-owned interfaces to the React application -- no React page or
// component calls fetch('/api/...') directly.
//
// Same-origin deployment (the Worker serves both the SPA and /api/*), so
// requests use relative paths and `credentials: 'include'` for the session
// cookie Phase 4 will introduce.
//
// An operation that hasn't been migrated yet fails explicitly (a thrown
// Error with a recognisable `.code`, e.g. 'not_implemented' or
// 'auth_required') rather than silently falling back to Base44 or pretending
// to succeed. See migration/HANDOVER.md and the Phase 3 checkpoint notes for
// which operations that applies to today.
// ---------------------------------------------------------------------------

async function apiFetch(path, { method = 'GET', body, headers } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
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

// Phase 4 will set an HttpOnly session cookie server-side (unreadable from
// JS) alongside a companion non-HttpOnly marker cookie the client can check
// cheaply without a round trip. Nothing sets that marker yet, so this is
// always false today -- which is the correct answer, since nobody can be
// authenticated yet either.
function hasSessionCookie() {
  return typeof document !== 'undefined' && document.cookie.includes('aurora_has_session=1');
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

  orders: {
    create: (data) => apiFetch('/api/orders', { method: 'POST', body: data }),
    get: (id) => apiFetch(`/api/orders/${encodeURIComponent(id)}`),
    listAll: () => apiFetch('/api/admin/orders'),
    update: (id, data) => apiFetch(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
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
    me: () => apiFetch('/api/auth/me'),
    loginWithPassword: (email, password) => apiFetch('/api/auth/login', { method: 'POST', body: { email, password } }),
    loginWithProvider: notImplemented('Sign-in is not available yet.'),
    register: (data) => apiFetch('/api/auth/register', { method: 'POST', body: data }),
    verifyEmail: (data) => apiFetch('/api/auth/verify-email', { method: 'POST', body: data }),
    resendVerification: (email) => apiFetch('/api/auth/resend-verification', { method: 'POST', body: { email } }),
    // No-op: Phase 4 sets the session as an HttpOnly cookie from the server
    // response itself: there is nothing for client code to store.
    setSession: () => {},
    // Nothing server-side to clear yet either -- just navigate.
    logout: (redirectUrl) => {
      if (redirectUrl) window.location.href = redirectUrl;
      else window.location.reload();
    },
    redirectToLogin: (nextUrl) => {
      window.location.href = `/login?returnTo=${encodeURIComponent(nextUrl)}`;
    },
    requestPasswordReset: (email) => apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: (data) => apiFetch('/api/auth/reset-password', { method: 'POST', body: data }),
  },
};
