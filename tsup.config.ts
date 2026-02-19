import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  dts: false,
  clean: true,
  shims: true,
  splitting: false,
  sourcemap: false,
  minify: true,
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.jsxImportSource = 'react';
  },
});
