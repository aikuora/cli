import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react-dom'],
  outExtension: { '.js': '.mjs' },
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
