# Aurora

Bespoke jewellery e-commerce storefront and admin.

## Architecture

- **Frontend** — React + Vite SPA (`src/`). The UI only ever calls `src/api/aurora.js` /
  `src/api/auth.js`, which delegate to `src/api/backend/cloudflare.js` — the single module that
  talks to the backend over HTTP. No component calls `fetch()` directly.
- **Backend** — a Cloudflare Worker (`worker/`) serving both the built static assets and `/api/*`
  from one origin. Routes → services → repositories, backed by D1.
- **Database** — Cloudflare D1 (SQLite). Schema lives in `worker/migrations/`.
- **Media** — Cloudflare R2. Catalogue/branding images are public (served through the Worker's
  `/media/*` route); bespoke and checkout special-request reference images are private, gated by a
  per-object access token (`/media-private/:id`).
- **Payments** — Stripe (PaymentIntents + webhooks), integrated directly against the Stripe REST
  API (no `stripe` SDK dependency).
- **Email** — Resend, for verification/reset emails, order confirmations, and bespoke/balance
  notifications.

`migration/` documents the app's earlier life on Base44 (data model, API contract, what had to move
server-side) — historical reference only; nothing in the running app depends on it.

## Prerequisites

- Node.js 20+
- A Cloudflare account with Wrangler authenticated (`npx wrangler login`) for any command that
  touches real Cloudflare resources (`wrangler dev`, `wrangler deploy`, `wrangler d1 ...`)
- A Stripe account (test mode) if you're working on payments
- A Resend account if you're working on email

## Setup

```bash
npm install
```

### Environment

Two local, gitignored files carry configuration:

**`.env`** (frontend build-time vars, read by Vite):

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**`.dev.vars`** (Worker secrets/vars for local `wrangler dev` and the test suite):

```
SECURITY_HASH_KEY=some-local-only-value
RESEND_API_KEY=
DEV_EMAIL_RECIPIENT_ALLOWLIST=you@example.com
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Leaving `RESEND_API_KEY`/`STRIPE_SECRET_KEY` blank is fine for local work that doesn't touch those
integrations — the relevant calls degrade to a no-op or are mocked in tests rather than failing the
whole request. `DEV_EMAIL_RECIPIENT_ALLOWLIST` (comma-separated) is a safety rail: outside
production, email only actually sends to addresses on that list.

For a deployed environment (e.g. `aurora-api-dev`), the equivalents are real Worker secrets, set
with `wrangler secret put <NAME> --env dev` — never committed, never passed as a CLI argument.

## Run locally

Frontend only (fastest iteration on UI, calls whatever backend `VITE_*`/relative `/api` resolves
to):

```bash
npm run dev
```

Full stack, including the Worker and a local D1 instance:

```bash
npx wrangler d1 migrations apply aurora-dev --local --env dev   # first time / after a new migration
npx wrangler dev
```

## Checks

```bash
npm run lint       # eslint
npm test           # vitest — runs inside a real Workers runtime (Miniflare), not Node
npm run typecheck  # tsc, checkJs mode
npm run build      # vite build
```

## Database

```bash
npm run db:migrate:local   # apply migrations to the local D1 instance
npm run db:migrate:dev     # apply migrations to the real aurora-dev D1 (remote)
```

Migration files are plain, ordered `.sql` files in `worker/migrations/` — there's no separate ORM
or schema DSL.

## Deploy

```bash
npm run build
npx wrangler deploy --env dev
```

This ships to the `aurora-api-dev` Worker. There is no `production` environment configured yet
(`wrangler.jsonc`'s `env.production` block is placeholder-only pending a real Cloudflare account
and domain for cutover).

## Project layout

```
src/                    React SPA
  api/aurora.js         Data API surface the UI calls
  api/auth.js           Auth API surface the UI calls
  api/backend/cloudflare.js   The only module that calls the Worker's HTTP API
worker/
  src/routes/           HTTP route handlers
  src/services/         Business logic (checkout, payments)
  src/repositories/     D1 data access
  migrations/           D1 schema, applied in order
migration/               Historical Base44-migration documentation (reference only)
```
