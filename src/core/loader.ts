import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { parse } from 'yaml';

import { toolConfigSchema, type ToolConfig } from '../types/tool-config.js';

export const TOOL_CONFIG_FILENAME = 'aikuora.config.yaml';

export interface LoaderError {
  type: 'not_found' | 'invalid_yaml' | 'validation_error';
  message: string;
  details?: unknown;
}

export interface LoaderResult {
  success: boolean;
  data?: ToolConfig;
  error?: LoaderError;
}

/**
 * Load and validate a tool's config file
 */
export function loadToolConfig(toolPath: string): LoaderResult {
  const configPath = join(toolPath, TOOL_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return {
      success: false,
      error: {
        type: 'not_found',
        message: `Config file not found: ${configPath}`,
      },
    };
  }

  try {
    const fileContent = readFileSync(configPath, 'utf-8');

    let rawConfig: unknown;
    try {
      rawConfig = parse(fileContent);
    } catch (err) {
      return {
        success: false,
        error: {
          type: 'invalid_yaml',
          message: 'Failed to parse YAML file',
          details: err,
        },
      };
    }

    const result = toolConfigSchema.safeParse(rawConfig);

    if (!result.success) {
      return {
        success: false,
        error: {
          type: 'validation_error',
          message: 'Tool config validation failed',
          details: result.error.format(),
        },
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        message: 'Unexpected error loading tool config',
        details: err,
      },
    };
  }
}

/**
 * Check if a tool has a config file
 */
export function hasToolConfig(toolPath: string): boolean {
  const configPath = join(toolPath, TOOL_CONFIG_FILENAME);
  return existsSync(configPath);
}
