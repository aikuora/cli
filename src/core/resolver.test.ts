import { describe, expect, it } from 'vitest';

import type { ToolMap } from '../types/tool.js';
import { filterToolsBySource, getToolNames, resolveTool, toolExists } from './resolver.js';

describe('Tool Resolver', () => {
  const mockTools: ToolMap = {
    prettier: {
      name: 'prettier',
      path: '/builtin/prettier',
      source: 'built-in',
      capabilities: { linkable: true, scaffoldable: false },
    },
    eslint: {
      name: 'eslint',
      path: '/project/eslint',
      source: 'project',
      capabilities: { linkable: true, scaffoldable: false },
    },
    custom: {
      name: 'custom',
      path: '/custom/tool',
      source: 'custom',
      capabilities: { linkable: false, scaffoldable: true },
    },
  };

  describe('resolveTool', () => {
    it('should resolve existing tool', () => {
      const tool = resolveTool('prettier', mockTools);
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('prettier');
    });

    it('should return null for non-existent tool', () => {
      const tool = resolveTool('nonexistent', mockTools);
      expect(tool).toBeNull();
    });
  });

  describe('toolExists', () => {
    it('should return true for existing tool', () => {
      expect(toolExists('prettier', mockTools)).toBe(true);
    });

    it('should return false for non-existent tool', () => {
      expect(toolExists('nonexistent', mockTools)).toBe(false);
    });
  });

  describe('getToolNames', () => {
    it('should return sorted tool names', () => {
      const names = getToolNames(mockTools);
      expect(names).toEqual(['custom', 'eslint', 'prettier']);
    });

    it('should return empty array for empty tool map', () => {
      const names = getToolNames({});
      expect(names).toEqual([]);
    });
  });

  describe('filterToolsBySource', () => {
    it('should filter built-in tools', () => {
      const filtered = filterToolsBySource(mockTools, 'built-in');
      expect(Object.keys(filtered)).toEqual(['prettier']);
    });

    it('should filter project tools', () => {
      const filtered = filterToolsBySource(mockTools, 'project');
      expect(Object.keys(filtered)).toEqual(['eslint']);
    });

    it('should filter custom tools', () => {
      const filtered = filterToolsBySource(mockTools, 'custom');
      expect(Object.keys(filtered)).toEqual(['custom']);
    });
  });
});
