import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  test: {
    include: ['worker/test/**/*.test.js'],
    setupFiles: ['./worker/test/setup.js'],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc', environment: 'dev' },
    }),
  ],
});
