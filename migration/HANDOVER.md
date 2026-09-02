# Aurora — Handover from Base44

**Status:** Final Base44 reference implementation. This commit is the last state in which
Aurora runs on Base44. Everything after this is migration work on another platform.

Related documents in this folder:

| File | Purpose |
|---|---|
| `DATA_MODEL.md` | Complete data dictionary for every entity and field |
| `API_CONTRACT.md` | Every operation the frontend expects from a backend |
| `BASE44_DEPENDENCIES.md` | Exhaustive inventory of what still touches Base44 |
| `MEDIA.md` | Where images live and how uploads work |
| `STRIPE.md` | Honest statement of what payment functionality exists (very little) |
| `SERVER_REQUIREMENTS.md` | Logic currently in the browser that must move server-side |
| `EXPORT.md` + `export/*.json` | Data export procedure and a snapshot taken at handover |

---

## 1. Current architecture

```
┌──────────────────────────────────────────────────────────────┐
│  React UI  (src/pages, src/components, src/lib, src/config)  │
│  – knows nothing about Base44                                │
└───────────────────────────┬──────────────────────────────────┘
                            │ imports only
┌───────────────────────────▼──────────────────────────────────┐
│  Aurora service interfaces                                   │
│  src/api/aurora.js   → api.products / categories / …/ media  │
│  src/api/auth.js     → auth.me / login / register / …        │
└───────────────────────────┬──────────────────────────────────┘
                            │ imports only
┌───────────────────────────▼──────────────────────────────────┐
│  Backend adapter (REPLACE THIS)                              │
│  src/api/backend/base44.js      – entities, uploads, auth     │
│  src/api/backend/appParams.js   – Base44 bootstrap params     │
│  src/api/base44Client.js        – SDK instantiation           │
└──────────────────────────────────────────────────────────────┘
```

* **Frontend:** React 18 + Vite + Tailwind + shadcn/ui. JavaScript (JSX), not TypeScript.
* **Routing:** `react-router-dom` v6, all routes in `src/App.jsx`.
* **State:** React state + one context each for cart (`CartContext`) and auth (`AuthContext`).
  Cart is persisted in `localStorage` under `aurora_cart`. Theme preference in `aurora_theme`.
* **Data access:** exclusively via `api.*` from `src/api/aurora.js`.
* **Auth access:** exclusively via `auth.*` from `src/api/auth.js` (also exposed as `api.auth`).

## 2. What Base44 currently provides

| Capability | Base44 feature | Adapter entry point |
|---|---|---|
| Database (9 entities) | Base44 Entities (schema files in `base44/entities/*.jsonc`) | `backend.collections.*` |
| File storage | `integrations.Core.UploadFile` → public URL on `media.base44.com` | `backend.media.upload` |
| Authentication | Base44 Auth (email+password, Google OAuth, OTP email verification, password reset emails) | `backend.auth.*` |
| App-level access gate | `/api/apps/public/prod/public-settings/by-id/:appId` | `backend.auth.checkAppAccess` |
| User records + roles | Built-in `User` entity (`role`: `admin` \| `user`) | `backend.collections.users` |
| Hosting / build | `@base44/vite-plugin`, published at aurora-creations.base44.app | `vite.config.js` |
| Image CDN transforms | `src/components/ui/image.jsx` rewrites `media.base44.com` URLs for resizing | UI component (pass-through for other hosts) |

Not provided by Base44 today (and not built): payments, transactional email, server-side
pricing, inventory decrement, webhooks.

## 3. What is portable (keep as-is)

* All pages and components under `src/pages`, `src/components`.
* `src/api/aurora.js` and `src/api/auth.js` — these ARE the contract; keep their signatures.
* `src/lib/pricing.js`, `src/lib/format.js`, `src/lib/theme.js`, `src/lib/authReturnTo.js`.
* `src/components/cart/CartContext.jsx` (localStorage cart).
* `src/components/ProtectedRoute.jsx` (depends only on `useAuth`).
* `src/lib/AuthContext.jsx` logic (see the one platform-forced import line, §6).
* Tailwind config, design tokens in `src/index.css`, `src/config/brand.js`.
* Entity JSON schemas in `base44/entities/*.jsonc` — reuse as the source for D1 DDL / validation.

## 4. What must be replaced

| Item | Replacement |
|---|---|
| `src/api/backend/base44.js` | New adapter with identical `backend` shape calling your REST API |
| `src/api/backend/appParams.js` | Delete (or replace with your own session bootstrap) |
| `src/api/base44Client.js` | Delete |
| `@base44/sdk`, `@base44/vite-plugin` in `package.json` | Remove; drop plugin from `vite.config.js` |
| `base44/` directory, `README.md` (Base44 dev workflow), `AGENTS.md`, `CLAUDE.md` | Remove or rewrite |
| `manifest.json` reference in `index.html` | Serve your own or remove |
| Branding image URLs in `src/config/brand.js` and `index.html` favicon | Re-host (see `MEDIA.md`) |
| Product/category/collection image URLs stored in data | Re-host (see `MEDIA.md`) |
| `import { base44 }` line in `src/lib/AuthContext.jsx` | Delete the line (unused; forced by Base44 validation) |
| `src/components/ui/image.jsx` + `image-helpers.js` | Optional: simplify to a plain `<img>` or point at your CDN |

## 5. Service interfaces intended to remain

The replacement backend must satisfy `migration/API_CONTRACT.md`. In short:

```
api.products      listPublished · getBySlug · get · listAll · create · update · remove
api.categories    listPublished · listAll
api.collections   listPublished · listAll
api.orders        create · get · listAll · update
api.bespoke       create · listAll · update
api.discounts     listAll · validate · markUsed
api.settings      get · save
api.newsletter    subscribe · listAll
api.users         listAll
api.media         upload
api.auth / auth   hasSession · checkAccess · me · login · loginWithGoogle · register ·
                  verifyEmail · resendVerification · logout · redirectToLogin ·
                  forgotPassword · resetPassword
```

## 6. Current authentication architecture

* **Roles:** Base44 `User.role` is `admin` or `user`. `AdminLayout` blocks non-admins client-side
  (`user.role !== 'admin'`). **There is no server-side authorisation today** — any authenticated
  user can call any entity operation through the SDK. This is the single biggest security gap
  and must be fixed server-side (see `SERVER_REQUIREMENTS.md §10`).
* **Session:** Base44 issues a bearer token, delivered via `?access_token=` on redirect and
  stored in `localStorage` (`base44_access_token`). `appParams.js` reads/persists it.
* **Bootstrap:** `AuthProvider.checkAppState()` → `auth.checkAccess()` (app public settings) →
  if a token exists, `auth.me()`. Errors are normalised to `{ code: 'auth_required' |
  'user_not_registered' | 'unknown' }`.
* **Flows:**
  * Login: `auth.login(email, password)` then hard redirect to safe `returnTo` (see `authReturnTo.js`).
  * Google: `auth.loginWithGoogle(returnTo)` — full-page OAuth redirect.
  * Register: `auth.register` → OTP email → `auth.verifyEmail({email, code})` (stores session) → redirect.
  * Forgot: `auth.forgotPassword(email)` — UI always shows generic success.
  * Reset: `/reset-password?token=…` → `auth.resetPassword({ token, newPassword })` → `/login`.
* **Public storefront:** the app is configured as public; anonymous users can browse, add to
  cart, check out (order records are created without login) and submit bespoke requests.
* **Platform constraint:** Base44 refuses to save `src/lib/AuthContext.jsx` unless it contains
  `import { base44 } from '@/api/base44Client'`. The line is present but unused. Delete it
  when leaving Base44.

## 7. Current data model

Nine entities: `Product`, `Category`, `Collection`, `Order`, `BespokeRequest`, `DiscountCode`,
`StoreSettings` (singleton), `NewsletterSubscriber`, `User` (platform-owned). Full field-level
dictionary in `DATA_MODEL.md`. All records carry Base44 built-ins `id`, `created_date`,
`updated_date`, `created_by_id`, `is_sample`.

Relationships are by string id: `Product.category_id → Category.id`,
`Product.collection_ids[] → Collection.id`, `Order.items[].product_id → Product.id`.
Orders embed a full snapshot of each line (name, sku, price, options, customisations, special
request) so they are self-contained.

## 8. Current media architecture

Uploads (product images, bespoke reference images, special-request reference images) go
through `api.media.upload(file)` → Base44 `UploadFile` → a public URL on
`https://media.base44.com/...`. That URL string is stored directly in the record. Branding assets
are hard-coded URLs on the same host. Seeded product/category/collection images are Unsplash
URLs. Details and a migration checklist are in `MEDIA.md`.

## 9. Current Stripe status

**Stripe is not integrated.** `@stripe/stripe-js` and `@stripe/react-stripe-js` are installed but
never imported. Checkout records the order as `payment_status: 'pending'` and shows copy telling
the customer payment instructions will follow. `StoreSettings.stripe_enabled` /
`stripe_test_mode` are stored flags with no effect. The admin can record payments manually.
Full breakdown in `STRIPE.md`.

## 10. Known migration risks

1. **No server-side authorisation.** Entity CRUD is open to any authenticated user via the SDK
   today; a REST backend must enforce admin-only routes.
2. **Client-side pricing.** Totals, discounts, shipping, VAT and deposits are computed in the
   browser and written to the order verbatim. Must be recomputed server-side before any
   payment is taken.
3. **Discount `usage_count` is incremented client-side** after order creation, non-atomically.
4. **No inventory decrement.** `stock_quantity` never changes on purchase.
5. **Order numbers** are `AUR-<base36 timestamp>` generated in the browser — not guaranteed unique.
6. **Settings singleton** is "first record wins" (`StoreSettings.list()[0]`).
7. **Product slug uniqueness** is not enforced; `getBySlug` returns the first match.
8. **`getBySlug` on the public storefront does not filter on `status: 'published'`**, so a draft
   product is reachable by URL. Mirror or fix in the new backend.
9. **Image URLs on `media.base44.com`** will stop resolving if the Base44 app is deleted before
   re-hosting.
10. **User accounts cannot be exported with credentials.** Users must re-register or be
    migrated via password-reset emails on the new platform (`EXPORT.md`).
11. **`AuthContext` normalisation** relies on Base44 error shapes; the new adapter must throw
    errors with a `.code` of `'auth_required'` where appropriate or `ProtectedRoute` will
    misbehave.
12. **Image component** (`ui/image.jsx`) rewrites `media.base44.com` URLs; after re-hosting it
    becomes a plain `<img>` pass-through — fine, but srcset/WebP optimisation is lost unless
    re-implemented for the new CDN.