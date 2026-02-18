import { describe, expect, it } from 'vitest';

import { groupToolsByCapability, scanAllTools } from './scanner.js';

describe('Tool Scanner', () => {
  describe('scanAllTools', () => {
    it('should always return built-in tools regardless of project path', () => {
      const tools = scanAllTools('/nonexistent/path');
      expect(tools['prettier']).toBeDefined();
      expect(tools['prettier']?.source).toBe('built-in');
    });

    it('should include built-in tools when scanning from project root', () => {
      const tools = scanAllTools(process.cwd());
      expect(tools).toBeDefined();
      expect(tools['prettier']).toBeDefined();
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
