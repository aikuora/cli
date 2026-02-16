import { describe, expect, it } from 'vitest';

import { toolConfigSchema } from '../types/tool-config.js';

describe('Tool Config Loader', () => {
  describe('toolConfigSchema', () => {
    it('should validate minimal config', () => {
      const config = {
        metadata: {
          name: 'prettier',
          description: 'Code formatter',
        },
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate linkable config', () => {
      const config = {
        metadata: {
          name: 'prettier',
        },
        linkable: {
          variants: {
            default: '.prettierrc.json',
            yaml: '.prettierrc.yaml',
          },
          instructions: 'Copy config to target',
        },
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate scaffoldable config', () => {
      const config = {
        metadata: {
          name: 'nextjs',
        },
        scaffoldable: {
          variables: {
            name: 'string',
            typescript: 'boolean',
          },
          postScaffold: 'npm install',
        },
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should apply defaults', () => {
      const config = {
        metadata: {
          name: 'tool',
        },
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      expect(result.data?.metadata.authors).toEqual([]);
    });

    it('should reject invalid config', () => {
      const config = {
        metadata: {},
      };

      const result = toolConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});
