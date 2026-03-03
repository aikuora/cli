import { findConfigPath, readConfig } from '../managers/config.js';
import type { Config } from '../types/config.js';

export type ValidateWorkspaceResult =
  | { valid: true; config: Config }
  | { valid: false; error: string };

/**
 * Validate the aikuora.workspace.yml found by walking up from `cwd`.
 *
 * Returns `{ valid: true, config }` when the config exists and is valid,
 * or `{ valid: false, error }` with a descriptive message naming the
 * specific invalid or missing field.
 *
 * Never throws — all errors are returned as `{ valid: false, error }`.
 */
export function validateWorkspace(cwd?: string): ValidateWorkspaceResult {
  const startDir = cwd ?? process.cwd();
  const configPath = findConfigPath(startDir);

  if (!configPath) {
    return {
      valid: false,
      error: `No aikuora.workspace.yml found in ${startDir} or any parent directory`,
    };
  }

  const result = readConfig(configPath);

  if (!result.success) {
    const errorType = result.error?.type;

    if (errorType === 'invalid_yaml') {
      return { valid: false, error: `aikuora.workspace.yml contains invalid YAML` };
    }

    if (errorType === 'validation_error') {
      // Extract field-level messages from the Zod error details when available.
      const details = result.error?.details as
        | { _errors?: string[]; name?: { _errors?: string[] }; scope?: { _errors?: string[] } }
        | undefined;

      if (details?.name?._errors?.length) {
        return { valid: false, error: `Invalid workspace config: name — ${details.name._errors[0]}` };
      }

      if (details?.scope?._errors?.length) {
        return {
          valid: false,
          error: `Invalid workspace config: scope — ${details.scope._errors[0]}`,
        };
      }

      return {
        valid: false,
        error: result.error?.message ?? 'aikuora.workspace.yml validation failed',
      };
    }

    return {
      valid: false,
      error: result.error?.message ?? 'Could not read aikuora.workspace.yml',
    };
  }

  return { valid: true, config: result.data! };
}
