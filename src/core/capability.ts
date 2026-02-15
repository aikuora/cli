import { existsSync } from 'fs';
import { join } from 'path';

import type { ToolCapabilities } from '../types/tool.js';

/**
 * Detect tool capabilities by checking for specific directories
 */
export function detectCapabilities(toolPath: string): ToolCapabilities {
  const configsPath = join(toolPath, 'configs');
  const templatesPath = join(toolPath, 'templates');

  return {
    linkable: existsSync(configsPath),
    scaffoldable: existsSync(templatesPath),
  };
}

/**
 * Check if a tool is a hybrid tool (both linkable and scaffoldable)
 */
export function isHybrid(capabilities: ToolCapabilities): boolean {
  return capabilities.linkable && capabilities.scaffoldable;
}

/**
 * Get a human-readable description of tool capabilities
 */
export function describeCapabilities(capabilities: ToolCapabilities): string {
  if (isHybrid(capabilities)) {
    return 'hybrid (linkable + scaffoldable)';
  }
  if (capabilities.linkable) {
    return 'linkable';
  }
  if (capabilities.scaffoldable) {
    return 'scaffoldable';
  }
  return 'none';
}
