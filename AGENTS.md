# AGENTS.md

## Project Context

Aurora is a bespoke jewellery e-commerce app. It was originally built on Base44 and has since been
fully migrated off it: the frontend is a plain Vite/React SPA, and the backend is a Cloudflare
Worker (D1, R2, Stripe, Resend). There is no Base44 dependency of any kind left in the runtime —
see `migration/` for the historical record of that migration, and `README.md` for how to actually
run the app.

Treat this as user-owned application code: keep changes focused on the user's request and preserve
existing project conventions.

## Architecture

- `src/`: React/Vite frontend.
- `src/api/aurora.js` / `src/api/auth.js`: the only modules the UI talks to for data/auth. They
  delegate to `src/api/backend/cloudflare.js`, the sole place that calls the Worker's REST API. No
  component calls `fetch('/api/...')` directly.
- `worker/`: the Cloudflare Worker (routes, services, repositories, D1 migrations). Serves both
  `/api/*` and the built static assets from one origin.
- `migration/`: historical documentation from the Base44 migration (data model, API contract,
  server-requirements audit). Useful as design reference; not part of the running app.

## Working Notes

- Local frontend dev: `npm run dev` (Vite only, talks to whichever backend `VITE_*` env points at).
- Local full-stack dev (Worker + D1): `npx wrangler dev`.
- Run the relevant checks from `package.json` (`npm run lint`, `npm test`, `npm run build`) before
  finishing code changes.
- Deploys go through Wrangler (`npx wrangler deploy --env dev`), never a Base44 CLI or dashboard —
  there is no Base44 project behind this app anymore.
