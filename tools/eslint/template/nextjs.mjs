// Requires eslint-config-next to be installed (included with the `next` package).
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores from eslint-config-next
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
