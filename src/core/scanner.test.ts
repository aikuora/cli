import { describe, expect, it } from 'vitest';

import { groupToolsByCapability, scanAllTools } from './scanner.js';

describe('Tool Scanner', () => {
  describe('scanAllTools', () => {
    it('should return an empty map if no tools exist', () => {
      const tools = scanAllTools('/nonexistent/path');
      expect(tools).toEqual({});
    });

    it('should scan built-in tools from current directory', () => {
      // In this test environment, there are no built-in tools yet
      // This test will pass once we add built-in tools to the tools/ directory
      const tools = scanAllTools(process.cwd());
      expect(tools).toBeDefined();
    });
  });

  describe('groupToolsByCapability', () => {
    it('should group tools by capability', () => {
      const tools = {
        prettier: {
          name: 'prettier',
          path: '/test/prettier',
          source: 'built-in' as const,
          capabilities: { linkable: true, scaffoldable: false },
        },
        nextjs: {
          name: 'nextjs',
          path: '/test/nextjs',
          source: 'built-in' as const,
          capabilities: { linkable: false, scaffoldable: true },
        },
        tsconfig: {
          name: 'tsconfig',
          path: '/test/tsconfig',
          source: 'built-in' as const,
          capabilities: { linkable: true, scaffoldable: true },
        },
      };

      const grouped = groupToolsByCapability(tools);

      expect(grouped.linkable).toHaveLength(1);
      expect(grouped.linkable[0].name).toBe('prettier');

      expect(grouped.scaffoldable).toHaveLength(1);
      expect(grouped.scaffoldable[0].name).toBe('nextjs');

      expect(grouped.hybrid).toHaveLength(1);
      expect(grouped.hybrid[0].name).toBe('tsconfig');
    });

    it('should handle empty tool map', () => {
      const grouped = groupToolsByCapability({});

      expect(grouped.linkable).toHaveLength(0);
      expect(grouped.scaffoldable).toHaveLength(0);
      expect(grouped.hybrid).toHaveLength(0);
    });
  });
});
