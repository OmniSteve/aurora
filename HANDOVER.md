# Aurora — Project Handover

**Written:** 2026-09-04
**Status:** Production infrastructure is live but gated. **Aurora is not launched.** Launch is
explicitly deferred until **November 2026**.

This document is a snapshot of where the project actually stands right now — not a design
reference (see `migration/` for that) and not a step-by-step migration log (see `git log` on
`cloudflare-migration`, where every commit is written to stand alone). Read this first if you're
picking the project up cold.

---

## 1. The short version

- The Base44 → Cloudflare migration (Phases 0–9) is complete. No Base44 dependency remains
  anywhere in the running app.
- Production Cloudflare infrastructure (D1, R2, Worker, custom domain, live Stripe, live Resend)
  is fully provisioned and has been live-tested with a real £4.00 Stripe purchase + refund.
- The public storefront is deliberately hidden behind an application-level **Coming Soon gate**
  (§4) — the domain resolves and serves real infrastructure, but no customer can browse, register,
  or buy anything on it yet.
- Production data was reset to a clean pre-launch state (§6) after acceptance testing. There is
  currently **exactly one product** in production. The real launch catalogue still needs to be
  built.
- Most recent work: a full customer-facing frontend redesign ("premium crystal & gemstone
  atelier" brand direction), landed but **not yet visually verified by a human** (§9).

## 2. Architecture

See `AGENTS.md` for the authoritative summary and `migration/` for the full historical record.
In one line: Vite/React SPA (`src/`) talking only to `src/api/aurora.js` / `src/api/auth.js`,
backed by a single Cloudflare Worker (`worker/`) serving both `/api/*` and the built static
assets from one origin, with D1 for data, R2 for media, Stripe for payments, Resend for email.

## 3. Production Cloudflare resources

| Resource | Value |
|---|---|
| Worker (production) | `aurora-api` |
| Worker (dev) | `aurora-api-dev` |
| D1 (production) | `aurora-production` (`05d40f4f-8077-43d3-81f1-29e3fce75106`), migrations `0001`–`0016` applied |
| D1 (dev) | `aurora-dev` (`5c590ff8-7a0c-4678-98a4-0e6b90376fd6`) |
| R2 (production) | `aurora-media` (public), `aurora-uploads` (private) |
| R2 (dev) | `aurora-media-dev`, `aurora-uploads-dev` |
| Custom domain | `auroracreations.uk` (Cloudflare Custom Domain, DNS/certs auto-managed) |
| Fallback hostname | `https://aurora-api.omni-design.workers.dev` — kept live deliberately, unaffected by the launch gate, used for all controlled testing |
| Cron | Reservation-expiry sweep, `*/5 * * * *`, confirmed registered in production. **Required a Workers Paid plan upgrade** — the account previously hit the Free plan's 5-cron-trigger-per-account limit (shared with other unrelated projects on the same account). |
| Rate limits (production) | `RL_AUTH` = `5001`, `RL_PUBLIC` = `5002` — deliberately distinct namespace IDs from dev's `4001`/`4002` |

Full `wrangler.jsonc` is the source of truth; every non-obvious value in it has an inline comment
explaining why.

## 4. The Coming Soon launch gate

`worker/src/middleware/launchGate.js`, wired in at the very top of `worker/src/index.js`. Two
independent conditions both gate it: the request's **hostname must be exactly
`auroracreations.uk`** (never `aurora-api.omni-design.workers.dev`), *and* `env.SITE_LAUNCHED`
(a `wrangler.jsonc` var, currently `"false"`) must not equal the literal string `"true"`. Both
conditions are required on purpose — a copy/paste of dev vars into production can't accidentally
launch it, and testing on the workers.dev fallback is never blocked regardless of the flag.

While active, on `auroracreations.uk`:
- Any normal navigation request gets a fully self-contained "Coming Soon" HTML page
  (`worker/src/lib/comingSoon.js`) — no shop/cart/login links, `noindex,nofollow`.
- Every public state-changing endpoint (register, verify-email, forgot/reset-password, newsletter
  subscribe, bespoke submission, private uploads, order creation, payment-intent creation) returns
  `503 { "error": "launch_pending" }`, checked directly against the API, not just hidden in the UI.
- Two explicit exceptions: `GET /api/health` and `POST /api/webhooks/stripe` — both keep working
  normally, so monitoring and the live Stripe webhook are unaffected.

**To actually launch:** flip `SITE_LAUNCHED` to `"true"` in `wrangler.jsonc`'s
`env.production.vars`, redeploy. Do not do this without explicit instruction — see §10.

## 5. Stripe (live)

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set in production (values entered directly
  by the account owner via `wrangler secret put`, never seen by an agent).
- Live webhook endpoint `we_1UBbHdCvF3HR5Zr3IhHlf78r` →
  `https://auroracreations.uk/api/webhooks/stripe`, subscribed to `payment_intent.succeeded`,
  `payment_intent.payment_failed`, `payment_intent.canceled`.
- Frontend build embeds the live publishable key (`pk_live_...`); confirmed no `pk_test_` literal
  in the deployed bundle.
- **Live-mode acceptance test performed and verified**: one real £4.00 purchase (was order
  `AUR-4`), full payment + full refund, both confirmed clean via direct Stripe API queries
  (exactly one charge, one refund, no duplicates). That order's Aurora-side records were removed
  in the later data reset (§6) — **Stripe's own transaction history was never touched and remains
  the permanent record**, visible in the live Stripe dashboard.

## 6. Production data state

A full production data reset was performed on 2026-09-03 (backup taken first — see §7). Current
state:

- **Exactly one product**: SKU `AUR-B-001`, "Blue Aquamarine & Rose Quartz Crystal",
  `stock_quantity = 10`, `reserved_quantity = 0`, category "Bracelets", collection "Celestial".
  This is a placeholder/test product, **not the real launch catalogue** — more products need to
  be added via Admin before launch.
- Orders, order items/payments/notes, inventory reservations, discount reservations, Stripe
  events, and idempotency keys are all at zero. `counters.order_number` reset to `0`, so the next
  real order will correctly be `AUR-1`.
- All 4 user accounts preserved (nothing deletes users — explicit standing instruction).
- `store_settings` / `shipping_methods` preserved as configured. `WELCOME10` confirmed absent.

## 7. Local backups (outside the repo, not committed)

| File | What it is |
|---|---|
| `C:/Test/Projects/aurora-full-history-backup-2026-09-03.bundle` | Full git history bundle, taken before a git-history rewrite that scrubbed two exposed real user emails from `migration/export/*.json` |
| `C:/Test/Projects/aurora-history-rewrite/` | The working clone used for that history rewrite |
| `C:/Test/Projects/aurora-production-baseline-2026-09-03.sql` | D1 schema-only snapshot, taken immediately after migrations were first applied to production, before any data import |
| `C:/Test/Projects/aurora-production-pre-reset-backup-2026-09-03.sql` | Full D1 data export taken immediately before the production data reset in §6 — this is the one to restore from if any of that reset needs undoing |

## 8. Notable fixes landed this phase (chronological, most recent last)

- **Checkout silently breaking**: the cart was cleared the instant an order was created (by
  design, to prevent duplicate orders), but the page's "cart is empty" guard didn't account for
  that, so it replaced the entire in-progress checkout — including the about-to-render payment
  form — with "Nothing to check out." No customer could ever have completed a real payment. Found
  during the live-payment acceptance test, before any real customer could hit it.
- Stripe Payment Element unreadable in dark mode (hardcoded light-theme Appearance config).
- Admin order detail page called the wrong (customer-ownership-gated) API, so it hung forever for
  any order that wasn't the viewing admin's own.
- A product-option validation message stuck on screen after the customer actually fixed the
  problem.
- Storefront footer was fully hardcoded (fake email, fake address, dummy social links) instead of
  reading Admin Settings. Fixed; the business address is deliberately kept out of the public API;
  each social platform got its own on/off toggle.
- `payment_status` was directly settable through the generic admin order-update endpoint (i.e.
  forgeable to `"paid"`/`"refunded"` without a real payment). Removed at both the route and
  repository layer; a proper confirmation-gated admin refund UI was built to replace it.
- No refund confirmation email existed at all (every other payment-lifecycle event had one).
- **`products.reserved_quantity` went negative in production** — a real data-corruption bug, not
  hypothetical. Root cause: two SQL statements batched together where only one was safely
  CAS-guarded; a losing concurrent caller (e.g. the cron sweep racing itself) still ran its
  unconditional decrement. Fixed with a proper two-step CAS pattern and regression tests that
  reproduce the exact race; production data reconciled to zero drift.
- Admin "Materials" field mangled multi-word/comma-separated input (a classic React
  controlled-input cursor-reset bug, not a string-parsing bug) — e.g. "Blue Aquamarine, Rose
  Quartz" became unreadable concatenated garbage. Fixed client-side and normalized server-side.
- Category/Collection management added to Admin Settings (the admin API already existed; there
  was just no UI). Found and fixed an unsafe cascade-delete in `collectionsRepository.remove()`
  in the process — it used to silently unlink a collection from every product using it instead of
  refusing the delete.
- **Full customer-facing frontend redesign** — see §9.

## 9. Frontend redesign (most recent, commit `908129a`)

A full visual/UX redesign of the customer-facing storefront toward a "premium crystal & gemstone
atelier" direction (warm ivory/charcoal palette, editorial typography, redesigned homepage/shop/
product page/nav/footer). Admin UI is provably untouched — the new colour palette is scoped to a
`.aurora-storefront` CSS class applied only by `StoreLayout`/`AuthLayout`, so Admin keeps its
original `:root`/`.dark` token values unchanged.

**This has had zero visual QA.** No browser automation tool was available in the session that
built it — lint/test/build all pass, which confirms it compiles and no existing test broke, but
nobody has actually looked at a rendered page. Before treating this as final:
- Open `https://aurora-api.omni-design.workers.dev` in a real browser, both light and dark theme.
- Check a real mobile viewport — this has never been done for any part of the redesign.
- Sanity-check the new Stripe Payment Element colours on the (still test-safe) checkout flow.

## 10. Explicit standing decisions — do not silently change these

- **Do not flip `SITE_LAUNCHED` or otherwise remove the Coming Soon gate** without an explicit,
  direct instruction to launch.
- **Google OAuth stays disabled** (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` unset, fails closed).
- **`WELCOME10` must remain absent/inactive** in production.
- `PUBLIC_ORIGIN` = `https://auroracreations.uk`, `EMAIL_FROM` =
  `Aurora Creations <enquiries@auroracreations.uk>` — both are real, locked values now, not
  placeholders.
- Production rate-limit namespaces must stay distinct from dev's.
- Never invent/guess a production secret, domain, or sender identity — these must always come
  from the account owner directly.

## 11. Known issues, flagged but deliberately not fixed

- `discountsRepository.js`'s `prepareCommitStatements`/`prepareReleaseStatements` almost
  certainly has the *exact same* unconditional-decrement race bug that was found and fixed in
  `inventoryRepository.js` (§8), affecting `discount_codes.reserved_count`. Flagged more than
  once, deliberately left alone each time because the fix requests were explicitly scoped to
  inventory only. Needs the same two-step CAS treatment before discounts see real traffic.
- SKU `AUR-B-001` has been used by two unrelated products across this project's history (the
  canonical migration source's "Tide Charm Bracelet", and the current placeholder "Blue
  Aquamarine & Rose Quartz Crystal"). Worth a deliberate SKU scheme decision before the real
  catalogue is built out, rather than continuing to reuse codes ad hoc.
- `AdminSettings.jsx`'s "Stripe enabled" / "Stripe test mode" toggles in `store_settings` are
  legacy/informational only — they have no effect on which Stripe key is actually used (that's
  purely env-secret-driven). Likely to confuse an admin; worth removing or relabeling before
  launch.
- Mobile layout has never been visually verified on a real narrow viewport anywhere in this
  project — the sandboxed browser used for earlier acceptance testing couldn't resize below
  ~1377px wide.

## 12. What's still needed before a real November launch

1. Build out the real product catalogue via Admin (currently one placeholder product).
2. Visual QA of the frontend redesign (§9) — real browser, both themes, real mobile devices.
3. Decide whether to fix the `discountsRepository.js` race (§11) before discounts go live.
4. Clear out the placeholder product / confirm the catalogue is launch-ready.
5. Flip `SITE_LAUNCHED = "true"`, redeploy, and re-run the full smoke test suite against the real
   domain (not just workers.dev).
6. Confirm the imported second Base44 user (`info@omnisolutions.dev`, still reset-required) is
   handled deliberately — it was explicitly excluded from any automatic reset/email throughout
   this project.
