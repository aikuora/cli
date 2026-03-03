import eslint from '@eslint/js';
import tsdoc from 'eslint-plugin-tsdoc';
import vitest from 'eslint-plugin-vitest';
import tseslint from 'typescript-eslint';

export default [
  // Ignore patterns
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.mjs', '*.config.ts'],
  },

  // Base ESLint recommended
  eslint.configs.recommended,

  // TypeScript recommended
  ...tseslint.configs.recommended,

  // Source TypeScript files (exclude config files)
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      tsdoc,
    },
    rules: {
      // Consistent type imports/exports
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',

      // TSDoc - warn for public API
      'tsdoc/syntax': 'warn',
    },
  },

  // Test files
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
    },
  },
];
