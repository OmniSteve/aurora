import { env } from 'cloudflare:test';

// vitest-pool-workers gives each test file an isolated, empty D1 instance --
// it doesn't share state with `wrangler d1 migrations apply --local`'s
// database. Apply the exact same committed migration files here so tests
// run against the real schema, not a hand-maintained copy of it.
//
// D1's env.DB.exec() is line-sensitive and rejects comment-only lines, so
// statements are split and run individually via prepare().run() instead --
// none of these migrations use a `;` inside a string literal, so a naive
// split is safe here.
const migrationModules = import.meta.glob('../migrations/*.sql', { query: '?raw', import: 'default', eager: true });

function splitStatements(sql) {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const sortedPaths = Object.keys(migrationModules).sort();
for (const path of sortedPaths) {
  for (const statement of splitStatements(migrationModules[path])) {
    await env.DB.prepare(statement).run();
  }
}
