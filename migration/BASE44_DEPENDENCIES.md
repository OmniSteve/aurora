# Aurora — Base44 Dependency Inventory

Exhaustive list of everything in the repository that depends on Base44. Anything not listed
here is platform-neutral. Verified by reading every file under `src/` that imports data, auth,
or uploads.

## A. Adapter layer (intended to be replaced wholesale)

| File | Dependency | Purpose | Replacement required |
|---|---|---|---|
| `src/api/backend/base44.js` | `@base44/sdk` client (`base44.entities.*`, `base44.integrations.Core.UploadFile`, `base44.auth.*`), `@base44/sdk/dist/utils/axios-client` | Entity CRUD for 9 entities, file upload, all auth operations, app access check | New adapter with the same exported `backend` shape over a REST API |
| `src/api/backend/appParams.js` | Base44 bootstrap query params (`app_id`, `access_token`, `from_url`, `functions_version`, `app_base_url`) + `localStorage` keys `base44_*`; `import.meta.env.VITE_BASE44_*` | Reads session token & app id injected by the platform | Delete; replace with own session bootstrap (cookie or token) |
| `src/api/base44Client.js` | `@base44/sdk` `createClient` | Instantiates SDK. Location fixed by Base44 tooling | Delete |

## B. Aurora service layer (keep, re-point imports)

| File | Dependency | Purpose | Replacement required |
|---|---|---|---|
| `src/api/aurora.js` | imports `backend` from `@/api/backend/base44` | Data API consumed by UI | Change one import line |
| `src/api/auth.js` | imports `backend` from `@/api/backend/base44` | Auth API consumed by UI | Change one import line |

## C. Platform-forced code in UI files

| File | Dependency | Purpose | Replacement required |
|---|---|---|---|
| `src/lib/AuthContext.jsx` | `import { base44 } from '@/api/base44Client'` (unused) | Base44 refuses to save this file without the line | Delete the import line. All logic already goes through `auth.*` |
| `src/lib/AuthContext.jsx` | Error codes `auth_required`, `user_not_registered` | Mirrors Base44 private-app semantics | Keep codes; new adapter must produce them (or always resolve `checkAccess` for a public app) |
| `src/lib/PageNotFound.jsx` | none (uses `api.auth.me()`) | Copy mentions "the AI" — Base44 builder wording | Optional copy change |
| `src/components/UserNotRegisteredError.jsx` | none | Shown for `user_not_registered` (Base44 allow-list concept) | Keep or remove |

## D. Build, hosting & tooling

| File | Dependency | Purpose | Replacement required |
|---|---|---|---|
| `package.json` | `@base44/sdk ^0.8.45`, `@base44/vite-plugin ^1.0.34` | SDK + Vite plugin (HMR notifier, analytics tracker, visual edit agent, legacy import shims) | `npm uninstall` both |
| `vite.config.js` | `import base44 from '@base44/vite-plugin'` | Plugin registration | Remove plugin; keep `react()` |
| `index.html` | `<link rel="manifest" href="/manifest.json">` (Base44-served), favicon on `media.base44.com` | PWA manifest & icon | Provide own manifest/icon or remove |
| `base44/config.jsonc` | Base44 CLI site config | Build/serve commands for Base44 hosting | Delete directory |
| `base44/entities/*.jsonc` | Base44 entity schemas | Database schema | Reuse as reference for D1 DDL; then delete |
| `base44/.app.jsonc` (gitignored) | App id pointer for CLI | Local dev link | Delete |
| `.gitignore` | `base44/.app.jsonc` entry | | Remove line |
| `README.md`, `AGENTS.md`, `CLAUDE.md` | Base44 development workflow docs | | Rewrite README for new stack; delete the others |
| `.env*` (gitignored) | `VITE_BASE44_APP_ID`, `VITE_BASE44_FUNCTIONS_VERSION`, `VITE_BASE44_APP_BASE_URL` | Injected at Base44 build | Replace with own `VITE_API_BASE_URL` etc. |

## E. Data & media hosted by Base44

| Location | Dependency | Purpose | Replacement required |
|---|---|---|---|
| `src/config/brand.js` | 3 URLs on `https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/…` | Logo, hero image, bespoke section image | Re-host in object storage / CDN, update constants |
| `index.html` favicon | same host | | Re-host |
| Entity data: `Product.images[].url`, `Product.seo.og_image`, `Category.image`, `Collection.hero_image`, `BespokeRequest.reference_images[]`, `Order.items[].image`, `Order.items[].special_request.images[]` | Any value starting `https://media.base44.com/` was uploaded via Base44 | Stored image URLs | Bulk download + re-upload + rewrite URLs (see MEDIA.md). Seeded records currently use Unsplash URLs which are unaffected |
| `src/components/ui/image.jsx`, `src/components/ui/image-helpers.js` | Recognises `media.base44.com` / `static.wixstatic.com` URLs and rewrites them for server-side resize/WebP | Image optimisation | Optional. Other hosts pass through as `<img>`; can simplify or adapt to new CDN |

## F. Runtime Base44 HTTP endpoints referenced

| Endpoint | Where | Purpose |
|---|---|---|
| `GET /api/apps/public/prod/public-settings/by-id/:appId` | `backend.auth.checkAppAccess` | App access gate |
| SDK-internal `/api/apps/:appId/entities/*`, `/api/apps/:appId/auth/*`, `/api/apps/:appId/integration-endpoints/Core/UploadFile` | via `@base44/sdk` | Entities, auth, upload |

No Base44 backend functions, workflows, agents or MCP configuration exist in this repository.
`src/pages/OAuthConsent.jsx` (a Base44 MCP consent page, never routed) was removed in this commit.

## G. Files verified Base44-free

All of: `src/pages/**` (except the forced line noted above — none), `src/components/**`,
`src/lib/pricing.js`, `src/lib/format.js`, `src/lib/theme.js`, `src/lib/authReturnTo.js`,
`src/lib/query-client.js`, `src/components/cart/CartContext.jsx`, `src/components/ProtectedRoute.jsx`,
`src/components/admin/**`, `src/App.jsx`, `src/main.jsx`, `tailwind.config.js`, `src/index.css`.

## H. Concepts that will silently disappear

* Base44 built-in field `is_sample` on every record — drop it.
* Base44 automatic `created_by_id` — decide whether to keep.
* Base44's hidden per-entity RLS (none configured — all entities are open to authenticated users).
* Base44 email delivery for OTP / password reset — you must provide an email provider.
* Google OAuth client — currently Base44's shared OAuth app; you need your own Google credentials.