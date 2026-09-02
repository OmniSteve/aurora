# Aurora — Backend / API Contract

This is the specification a replacement backend must satisfy. The frontend calls these through
`src/api/aurora.js` (`api.*`) and `src/api/auth.js` (`auth.*`). Implement them in a new
`src/api/backend/<name>.js` exposing the same `backend` object shape as `base44.js`, or rewrite
`aurora.js`/`auth.js` directly against REST endpoints — either way the UI is untouched.

Conventions

* All list operations return arrays of full records including `id`, `created_date`, `updated_date`.
* Errors are thrown (rejected promises). The UI generally shows a generic message; auth errors
  must carry `error.code` (see Authentication).
* Access levels: **Public** (anonymous), **Auth** (any signed-in user), **Admin** (`role === 'admin'`).
  Today Base44 does not enforce Admin server-side; the new backend **must**.
* Money is a JSON number in GBP with 2dp.

---

## products

| Operation | Params | Returns | Access | Notes |
|---|---|---|---|---|
| `listPublished()` | — | `Product[]` where `status = 'published'`, sorted `-created_date`, ≤200 | Public | Home, Shop, related products |
| `getBySlug(slug)` | `slug: string` | `Product \| null` | Public | First match. Recommended: restrict to published |
| `get(id)` | `id` | `Product` (throws if missing) | Admin (used by product editor) | |
| `listAll()` | — | `Product[]` all statuses, sorted `-updated_date`, ≤500 | Admin | |
| `create(data)` | full Product body (no id) | created `Product` | Admin | Used for new + duplicate |
| `update(id, data)` | id, partial/full body | updated `Product` | Admin | |
| `remove(id)` | id | — | Admin | Hard delete |

## categories

| Operation | Params | Returns | Access |
|---|---|---|---|
| `listPublished()` | — | `Category[]` where `published = true`, sorted `sort_order` asc | Public |
| `listAll()` | — | `Category[]` sorted `sort_order` | Admin |

## collections

| Operation | Params | Returns | Access |
|---|---|---|---|
| `listPublished()` | — | `Collection[]` where `published = true` | Public |
| `listAll()` | — | `Collection[]` | Admin |

## orders

| Operation | Params | Returns | Access | Notes |
|---|---|---|---|---|
| `create(data)` | full Order body (see DATA_MODEL) | created `Order` with `id` | Public | Called at checkout by anonymous customers. **New backend should recompute all totals server-side and ignore client money fields.** |
| `get(id)` | id | `Order` | Public today (confirmation page uses the id from the redirect); consider a signed token | |
| `listAll()` | — | `Order[]` sorted `-created_date`, ≤500 | Admin | |
| `update(id, data)` | id, partial | `Order` | Admin | Status changes, payments[], notes, totals |

## bespoke

| Operation | Params | Returns | Access |
|---|---|---|---|
| `create(data)` | BespokeRequest body with `status: 'new'` | created record | Public |
| `listAll()` | — | `BespokeRequest[]` sorted `-created_date`, ≤500 | Admin |
| `update(id, data)` | id, partial (status, quote, internal_notes) | record | Admin |

## discounts

| Operation | Params | Returns | Access | Notes |
|---|---|---|---|---|
| `listAll()` | — | `DiscountCode[]` | Admin | Export only |
| `validate(code, subtotal)` | `code: string`, `subtotal: number` | `{ valid: true, record, amount }` or `{ valid: false, reason }` | Public | Rules: code (uppercased, trimmed) exists & `active`; `starts_at ≤ now ≤ ends_at`; `usage_count < usage_limit`; `subtotal ≥ min_spend`. `amount = percentage ? subtotal×value/100 : min(value, subtotal)`, rounded 2dp. **Currently client-side; must become a server endpoint.** |
| `markUsed(record)` | the discount record | updated record | Public today | Increments `usage_count`. Should be atomic and happen inside order creation server-side. |

`reason` strings shown verbatim to customers: "Invalid discount code", "This code is not active
yet", "This code has expired", "This code has reached its usage limit", "Minimum spend of £X required".

## settings

| Operation | Params | Returns | Access |
|---|---|---|---|
| `get()` | — | `StoreSettings \| null` (single record) | Public (checkout needs shipping methods, tax, currency) |
| `save(data)` | full settings body (without id/timestamps) | record | Admin — upsert singleton |

## newsletter

| Operation | Params | Returns | Access |
|---|---|---|---|
| `subscribe(email)` | `email: string` | created record | Public |
| `listAll()` | — | `NewsletterSubscriber[]` | Admin |

## users

| Operation | Params | Returns | Access |
|---|---|---|---|
| `listAll()` | — | `{ id, email, full_name, role, created_date }[]` | Admin |

## media

| Operation | Params | Returns | Access | Notes |
|---|---|---|---|---|
| `upload(file)` | browser `File` (images) | `string` public URL | Public today (bespoke & special-request uploads are anonymous); Admin for product images | Suggested: presigned PUT to object storage, return public CDN URL. Enforce size/type limits. |

---

## Authentication (`auth.*`, also `api.auth`)

| Operation | Params | Returns / Behaviour | Errors |
|---|---|---|---|
| `hasSession()` | — | `boolean` — a local session token exists (unvalidated) | — |
| `checkAccess()` | — | Resolves with app-level public settings object (contents unused by UI beyond storing it). Purpose: detect whether the visitor may load the app. | Throws `Error` with `code`: `'auth_required'` (app is private and visitor is anonymous), `'user_not_registered'` (signed in but not on allow-list), else `'unknown'`. For a public storefront simply resolve. |
| `me()` | — | `{ id, email, full_name, role, ... }` | Throws with `code: 'auth_required'` when not signed in (401/403). Callers rely on this code. |
| `login(email, password)` | strings | Resolves after session stored. Caller does `window.location.href = returnTo`. | Throws with `message` shown inline |
| `loginWithGoogle(returnTo)` | same-origin path | Full-page redirect to provider; return to `returnTo` with session established | — |
| `register({ email, password })` | | Creates **unverified** account; sends OTP email. Does not log in. | Throws with `message` |
| `verifyEmail({ email, code })` | 6-digit string | Establishes session (stores token). Caller hard-redirects. | Throws with `message` |
| `resendVerification(email)` | | Re-sends OTP | Throws |
| `logout(redirectUrl?)` | optional URL | Clears session; navigates to `redirectUrl` or reloads | — |
| `redirectToLogin(nextUrl)` | | Navigates to `/login`, returning to `nextUrl` afterwards | — |
| `forgotPassword(email)` | | Sends reset email containing link to `/reset-password?token=…`. UI always shows success. | UI ignores errors |
| `resetPassword({ token, newPassword })` | | Sets password; UI then redirects to `/login` | Throws with `message` |

### Session & authorisation requirements for the new backend

* Issue an HttpOnly cookie or bearer token; expose `me()`.
* `role` must be returned on the user object; `admin` gates `/admin/*` in the UI **and must gate
  admin operations server-side**.
* Password reset link format `/reset-password?token=<opaque>` is expected by `ResetPassword.jsx`.
* `returnTo` handling is in `src/lib/authReturnTo.js` (same-origin only) — keep using it.

---

## Not yet in the contract (future backend work, see STRIPE.md / SERVER_REQUIREMENTS.md)

* `payments.createIntent(orderId)` / webhook confirmation
* `orders.requestBalance(orderId)`, refunds
* `bespoke.acceptQuote(id)` customer flow
* Transactional email (order confirmation, payment instructions, bespoke replies)
* Categories / collections / discounts admin CRUD