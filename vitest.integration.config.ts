import { defineConfig } from 'vitest/config';

/**
 * Integration test suite — boots real pglite instances per test.
 *
 * Kept separate from the default `vitest.config.ts` so fast DMMF/unit tests
 * don't pay the WASM boot cost. Single-threaded to avoid pglite contention.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
  },
});
