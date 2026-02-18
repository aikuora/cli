import jsdoc from 'eslint-plugin-jsdoc';
import tsdoc from 'eslint-plugin-tsdoc';
import jsonParser from 'jsonc-eslint-parser';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // TypeScript-ESLint recommended rules (no type-checking required)
  ...tseslint.configs.recommended,

  // Type-aware rules — consistent imports/exports enforce `import type` usage
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.mdx/**/*.ts', '**/*.mdx/**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
    },
  },

  // JSON / JSONC parsing
  {
    files: ['*.json', '*.json5'],
    languageOptions: { parser: jsonParser },
  },

  // Documentation quality — TypeScript source files only, exported elements only.
  // Uses `publicOnly: true` so JSDoc is required only on exported symbols.
  // TSDoc syntax is validated on any TSDoc comment that exists.
  {
    files: ['**/*.ts'],
    ignores: ['**/*.mdx/**/*.ts'],
    plugins: { tsdoc, jsdoc },
    languageOptions: {
      parserOptions: { projectService: true },
    },
    extends: [jsdoc.configs['flat/recommended-typescript']],
    rules: {
      'tsdoc/syntax': 'warn',
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            MethodDefinition: true,
            ArrowFunctionExpression: false,
          },
        },
      ],
      'jsdoc/check-param-names': 'warn',
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-indentation': 'warn',
      'jsdoc/check-line-alignment': 'warn',
      'jsdoc/check-template-names': 'warn',
      'jsdoc/check-property-names': 'warn',
      'jsdoc/check-syntax': 'warn',
      'jsdoc/check-types': 'warn',
      'jsdoc/check-values': 'warn',
      'jsdoc/require-param-name': 'warn',
      'jsdoc/require-property': 'warn',
      'jsdoc/require-property-description': 'warn',
      'jsdoc/require-property-name': 'warn',
      'jsdoc/require-property-type': 'warn',
      'jsdoc/check-examples': 'off',
      'jsdoc/tag-lines': 'off',
      'jsdoc/check-tag-names': 'off', // @typeParam is not standard JSDoc
    },
  },

  // Global ignores
  { ignores: ['**/dist', '**/node_modules'] },
);
