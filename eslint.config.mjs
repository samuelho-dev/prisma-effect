// @ts-check
import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript recommended rules (without type-checking)
  ...tseslint.configs.recommended,

  // Source files configuration
  {
    files: ['src/**/*.ts'],
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Best practices
      'no-console': 'off', // Generator needs console for logging
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Test files configuration
  {
    files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off', // Allow any in tests for mocking
      '@typescript-eslint/no-unused-vars': 'off', // Allow unused vars in tests
      // Recognize expectTypeOf as valid assertion for type-level tests
      'vitest/expect-expect': [
        'error',
        {
          assertFunctionNames: ['expect', 'expectTypeOf'],
        },
      ],
    },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '**/*.d.ts',
      'src/test-output*/**',
      'src/__tests__/generated/**',
      // Vendored read-only Effect v4 source (git subtree, agent reference only)
      'repos/**',
    ],
  }
);
