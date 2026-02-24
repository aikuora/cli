import { existsSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import type { DiscoveredTool, ToolMap, ToolSource } from '../types/tool.js';
import { detectCapabilities } from './capability.js';

/**
 * Get the path to built-in tools directory
 */
export function getBuiltInToolsPath(): string {
  // In development: <repo>/cli/tools/
  // In production: <node_modules>/@aikuora/cli/tools/
  // Bundled:  import.meta.url → dist/index.js    → dirname = dist/     → 1 level up = CLI root
  // Dev/test: import.meta.url → src/core/scanner.ts → dirname = src/core/ → 2 levels up = CLI root
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);
  const cliRoot =
    basename(currentDir) === 'dist'
      ? resolve(currentDir, '..')
      : resolve(currentDir, '../..');
  return join(cliRoot, 'tools');
}

/**
 * Scan a directory for tools
 */
export function scanToolDirectory(directoryPath: string, source: ToolSource): ToolMap {
  const tools: ToolMap = {};

  if (!existsSync(directoryPath)) {
    return tools;
  }

  try {
    const entries = readdirSync(directoryPath);

    for (const entry of entries) {
      const toolPath = join(directoryPath, entry);
      const stats = statSync(toolPath);

      // Only process directories
      if (!stats.isDirectory()) {
        continue;
      }

      // Skip hidden directories
      if (entry.startsWith('.')) {
        continue;
      }

      const capabilities = detectCapabilities(toolPath);
      const hasConfig = existsSync(join(toolPath, 'aikuora.tool.yml'));

      // Include tools with any capability OR with an aikuora.tool.yml (e.g. root tools)
      if (capabilities.linkable || capabilities.scaffoldable || hasConfig) {
        tools[entry] = {
          name: entry,
          path: toolPath,
          source,
          capabilities,
        };
      }
    }
  } catch {
    // Silently ignore errors (directory not readable, etc.)
  }

  return tools;
}

/**
 * Scan built-in tools
 */
export function scanBuiltInTools(): ToolMap {
  const builtInPath = getBuiltInToolsPath();
  return scanToolDirectory(builtInPath, 'built-in');
}

/**
 * Scan project tools
 */
export function scanProjectTools(projectRoot: string): ToolMap {
  const projectToolsPath = join(projectRoot, 'tools');
  return scanToolDirectory(projectToolsPath, 'project');
}

/**
 * Scan custom tool paths
 */
export function scanCustomTools(customPaths: string[]): ToolMap {
  const tools: ToolMap = {};

  for (const customPath of customPaths) {
    const absolutePath = resolve(customPath);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const stats = statSync(absolutePath);
    if (!stats.isDirectory()) {
      continue;
    }

    // Get the tool name from the directory name
    const toolName = basename(absolutePath);
    const capabilities = detectCapabilities(absolutePath);

    if (capabilities.linkable || capabilities.scaffoldable) {
      tools[toolName] = {
        name: toolName,
        path: absolutePath,
        source: 'custom',
        capabilities,
      };
    }
  }

  return tools;
}

/**
 * Scan all tool sources and merge them with override logic:
 * custom \> project \> built-in
 */
export function scanAllTools(projectRoot: string, customPaths: string[] = []): ToolMap {
  const builtInTools = scanBuiltInTools();
  const projectTools = scanProjectTools(projectRoot);
  const customTools = scanCustomTools(customPaths);

  // Merge with override logic
  return {
    ...builtInTools,
    ...projectTools,
    ...customTools,
  };
}

/**
 * Get a list of tools grouped by capability
 */
export function groupToolsByCapability(tools: ToolMap): {
  linkable: DiscoveredTool[];
  scaffoldable: DiscoveredTool[];
  hybrid: DiscoveredTool[];
} {
  const linkable: DiscoveredTool[] = [];
  const scaffoldable: DiscoveredTool[] = [];
  const hybrid: DiscoveredTool[] = [];

  for (const tool of Object.values(tools)) {
    if (tool.capabilities.linkable && tool.capabilities.scaffoldable) {
      hybrid.push(tool);
    } else if (tool.capabilities.linkable) {
      linkable.push(tool);
    } else if (tool.capabilities.scaffoldable) {
      scaffoldable.push(tool);
    }
  }

  return { linkable, scaffoldable, hybrid };
}
