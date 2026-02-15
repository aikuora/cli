/**
 * Tool types and interfaces
 */

export interface ToolCapabilities {
  /** Tool can be linked to targets (has configs/ directory) */
  linkable: boolean;
  /** Tool can scaffold new projects (has templates/ directory) */
  scaffoldable: boolean;
}

export type ToolSource = 'built-in' | 'project' | 'custom';

export interface DiscoveredTool {
  /** Tool name (directory name) */
  name: string;
  /** Absolute path to tool directory */
  path: string;
  /** Where the tool was discovered from */
  source: ToolSource;
  /** Tool capabilities */
  capabilities: ToolCapabilities;
}

export interface ToolMap {
  [name: string]: DiscoveredTool;
}
