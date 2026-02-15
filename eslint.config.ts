import eslint from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
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
      react,
      'react-hooks': reactHooks,
      tsdoc,
    },
    rules: {
      // Consistent type imports/exports
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',

      // React/Ink rules
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      ...reactHooks.configs.recommended.rules,

      // TSDoc - warn for public API
      'tsdoc/syntax': 'warn',
    },
    settings: {
      react: {
        version: '18.3',
      },
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
