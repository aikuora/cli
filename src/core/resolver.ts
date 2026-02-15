import type { DiscoveredTool, ToolMap } from '../types/tool.js';

/**
 * Resolve a tool by name from the tool map
 */
export function resolveTool(toolName: string, tools: ToolMap): DiscoveredTool | null {
  return tools[toolName] || null;
}

/**
 * Check if a tool exists
 */
export function toolExists(toolName: string, tools: ToolMap): boolean {
  return toolName in tools;
}

/**
 * Get all tool names
 */
export function getToolNames(tools: ToolMap): string[] {
  return Object.keys(tools).sort();
}

/**
 * Filter tools by source
 */
export function filterToolsBySource(
  tools: ToolMap,
  source: 'built-in' | 'project' | 'custom'
): ToolMap {
  const filtered: ToolMap = {};

  for (const [name, tool] of Object.entries(tools)) {
    if (tool.source === source) {
      filtered[name] = tool;
    }
  }

  return filtered;
}
