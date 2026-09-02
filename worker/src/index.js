// Placeholder Worker entry point.
// Phase 1 scope is the D1 schema only -- the real API surface, static asset
// serving and /api/health endpoint are built out in Phase 2/3. This file
// exists so wrangler.toml has a valid `main` to parse while running local
// D1 migrations.
export default {
  async fetch() {
    return new Response('Aurora API — under construction', { status: 200 });
  },
};
