import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('vitest-pool-workers smoke test', () => {
  it('has a D1 binding', async () => {
    expect(env.DB).toBeDefined();
    const row = await env.DB.prepare('SELECT 1 AS ok').first();
    expect(row.ok).toBe(1);
  });
});
