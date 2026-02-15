import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { parse, stringify } from 'yaml';
import type { ZodError } from 'zod';

import { configSchema, type Config } from '../types/config.js';

/**
 * Config manager for reading and writing aikuora.config.yaml
 */

export const CONFIG_FILENAME = 'aikuora.config.yaml';

export interface ConfigError {
  type: 'not_found' | 'invalid_yaml' | 'validation_error' | 'write_error';
  message: string;
  details?: unknown;
}

export interface ConfigResult {
  success: boolean;
  data?: Config;
  error?: ConfigError;
}

/**
 * Find the root config file by walking up from the given directory
 */
export function findConfigPath(startDir: string = process.cwd()): string | null {
  let currentDir = resolve(startDir);
  const root = resolve('/');

  while (currentDir !== root) {
    const configPath = resolve(currentDir, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      return configPath;
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

/**
 * Read and validate aikuora.config.yaml from the given path or find it automatically
 */
export function readConfig(configPath?: string): ConfigResult {
  try {
    // Find config if path not provided
    const resolvedPath = configPath || findConfigPath();

    if (!resolvedPath) {
      return {
        success: false,
        error: {
          type: 'not_found',
          message: `Config file '${CONFIG_FILENAME}' not found in current directory or any parent directory`,
        },
      };
    }

    // Read file
    const fileContent = readFileSync(resolvedPath, 'utf-8');

    // Parse YAML
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

    // Validate with zod
    const result = configSchema.safeParse(rawConfig);

    if (!result.success) {
      return {
        success: false,
        error: {
          type: 'validation_error',
          message: 'Config validation failed',
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
        message: 'Unexpected error reading config',
        details: err,
      },
    };
  }
}

/**
 * Write aikuora.config.yaml to the given path
 */
export function writeConfig(config: Config, configPath: string): ConfigResult {
  try {
    // Validate config before writing
    const result = configSchema.safeParse(config);

    if (!result.success) {
      return {
        success: false,
        error: {
          type: 'validation_error',
          message: 'Config validation failed before writing',
          details: result.error.format(),
        },
      };
    }

    // Convert to YAML
    const yamlContent = stringify(result.data, {
      lineWidth: 100,
      indent: 2,
    });

    // Write file
    writeFileSync(configPath, yamlContent, 'utf-8');

    return {
      success: true,
      data: result.data,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        type: 'write_error',
        message: 'Failed to write config file',
        details: err,
      },
    };
  }
}

/**
 * Create a default config with the given project name and scope
 */
export function createDefaultConfig(name: string, scope?: string): Config {
  return {
    project: {
      name,
      scope,
    },
    structure: {
      apps: 'apps',
      packages: 'packages',
      modules: 'modules',
      tools: 'tools',
    },
    defaults: {
      node: 'lts',
      pnpm: 'latest',
      python: '3.12.x',
      uv: 'latest',
    },
    customTools: [],
  };
}

/**
 * Format validation errors for display
 */
export function formatValidationError(error: ZodError): string {
  return error.errors
    .map((err) => {
      const path = err.path.join('.');
      return `  - ${path}: ${err.message}`;
    })
    .join('\n');
}
