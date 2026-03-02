import { describe, expect, it } from 'vitest';

import { createDefaultConfig } from './config.js';

describe('Config Manager', () => {
  describe('createDefaultConfig', () => {
    it('should create a default config with name and scope', () => {
      const config = createDefaultConfig('test-project', '@test');

      expect(config.name).toBe('test-project');
      expect(config.scope).toBe('@test');
    });

    it('should use default structure values', () => {
      const config = createDefaultConfig('test', '@test');

      expect(config.structure.apps).toBe('apps');
      expect(config.structure.packages).toBe('packages');
      expect(config.structure.modules).toBe('modules');
      expect(config.structure.tools).toBe('tools');
    });

    it('should use default runtime versions', () => {
      const config = createDefaultConfig('test', '@test');

      expect(config.defaults.node).toBe('lts');
      expect(config.defaults.pnpm).toBe('latest');
      expect(config.defaults.python).toBe('3.12.x');
      expect(config.defaults.uv).toBe('latest');
    });

    it('should have empty customTools array', () => {
      const config = createDefaultConfig('test', '@test');

      expect(config.customTools).toEqual([]);
    });
  });
});
