import { describe, expect, it } from 'vitest';

import { toolConfigSchema } from '../types/tool-config.js';

describe('Tool Config Loader', () => {
  describe('toolConfigSchema', () => {
    it('should validate minimal config', () => {
      const config = {
        name: 'prettier',
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should apply defaults for customizable and prototools', () => {
      const config = {
        name: 'tool',
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      expect(result.data?.customizable).toBe(false);
      expect(result.data?.prototools).toEqual({});
    });

    it('should validate link config', () => {
      const config = {
        name: 'prettier',
        link: {
          dependency: true,
          targetFile: 'prettier.config.mjs',
          content: "export default { semi: false };",
          variants: [
            { name: 'default', default: true },
            { name: 'react', forTools: ['nextjs'] },
          ],
          moonTask: { name: 'format', command: 'prettier --write .' },
        },
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate scaffold config', () => {
      const config = {
        name: 'nextjs',
        scaffold: {
          type: 'app',
          devtools: ['prettier', 'eslint'],
          moonTasks: [
            { name: 'dev', command: 'next dev' },
            { name: 'build', command: 'next build' },
          ],
        },
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate full config with all fields', () => {
      const config = {
        name: 'nextjs',
        customizable: true,
        lang: 'typescript',
        runtime: 'node',
        packageManager: 'pnpm',
        prototools: { node: '20.0.0', pnpm: '9.0.0' },
        scaffold: {
          type: 'app',
          devtools: ['prettier'],
          moonTasks: [{ name: 'dev', command: 'next dev' }],
        },
        link: {
          dependency: false,
          targetFile: 'next.config.mjs',
          content: 'export default {};',
        },
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid scaffold type', () => {
      const config = {
        name: 'nextjs',
        scaffold: {
          type: 'library',
          devtools: [],
          moonTasks: [],
        },
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid lang', () => {
      const config = {
        name: 'tool',
        lang: 'ruby',
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject config missing name', () => {
      const config = {};

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});
