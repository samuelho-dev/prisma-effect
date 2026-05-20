import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/__tests__/integration/**/*'],
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**/*',
        'src/test-output*/**/*',
        '**/generated/**',
        '**/*.d.ts',
        'src/generator/index.ts', // Generator entry point (hard to test in isolation)
        'src/generator/contract-scaffolder.ts', // Contract scaffolding (feature-specific)
        'src/generator/domain-detector.ts', // Domain detection (feature-specific)
      ],
      thresholds: {
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      reporter: ['text', 'json', 'html'],
    },
  },
});
