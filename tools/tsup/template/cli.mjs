import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  platform: 'node',
  target: 'es2022',
  noExternal: [/.*/],
  minify: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
