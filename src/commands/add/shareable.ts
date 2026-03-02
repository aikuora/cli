import { resolve } from 'path';

import fse from 'fs-extra';

import { readConfig } from '../../managers/config.js';
import { output, outputError, outputSuccess } from '../../utils/output.js';
import { applyWorkspaceSettings } from '../../utils/workspace-integrations.js';
import type { AddOptions } from '../add.js';
import { ensureConfigsEntry } from './configs-entry.js';
import { ensureRequiredTools } from './root.js';
import { loadResolvedTool } from './shared.js';

// ---------------------------------------------------------------------------
// Mode E: Shareable tool setup (aikuora add prettier — no target)
// ---------------------------------------------------------------------------

export async function runShareable(options: AddOptions) {
  const { toolName, json, cwd = process.cwd() } = options;
  const projectRoot = resolve(cwd);

  const configResult = readConfig();
  if (!configResult.success) {
    const err = configResult.error?.message ?? 'Could not read project config';
    if (json) output({ action: 'add', mode: 'shareable', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const rootConfig = configResult.data!;

  const resolved = await loadResolvedTool(
    toolName,
    projectRoot,
    rootConfig.customTools,
    json,
    'shareable'
  );
  if (!resolved.success) return { success: false };
  const { discovered, toolConfig } = resolved;

  // Ensure required tools (e.g. pnpm) are set up before creating shared packages
  if (toolConfig.requires && toolConfig.requires.length > 0) {
    await ensureRequiredTools(toolConfig.requires, options);
  }

  const scope = rootConfig.scope;
  let createdPath: string | undefined;

  try {
    const { created, packageName, path: entryPath } = await ensureConfigsEntry(
      toolName,
      discovered.path,
      projectRoot,
      rootConfig.structure.packages,
      scope
    );
    if (created) createdPath = entryPath;

    if (toolConfig.workspace) {
      await applyWorkspaceSettings(projectRoot, toolConfig.workspace, toolName);
    }

    const destination = entryPath.replace(projectRoot + '/', '');

    const result = {
      action: 'add',
      mode: 'shareable',
      success: true,
      tool: toolName,
      packageName,
      destination,
      created,
    };

    if (json) output(result, { json });
    else
      outputSuccess(
        created
          ? `Created shared package ${packageName} at ${destination}`
          : `${packageName} already exists at ${destination}`,
        { json }
      );

    return result;
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    if (createdPath) {
      try {
        await fse.remove(createdPath);
        if (json) output({ action: 'add', mode: 'shareable', success: false, error }, { json });
        else outputError(error, { json });
      } catch (cleanupCaught) {
        const cleanupError = cleanupCaught instanceof Error ? cleanupCaught.message : String(cleanupCaught);
        if (json) {
          output({ action: 'add', mode: 'shareable', success: false, error, cleanupError, manualCleanupRequired: true, partialPath: createdPath }, { json });
        } else {
          outputError(error, { json });
          outputError(`Cleanup failed: ${cleanupError}. Please delete ${createdPath} manually.`, { json });
        }
      }
    } else {
      if (json) output({ action: 'add', mode: 'shareable', success: false, error }, { json });
      else outputError(error, { json });
    }
    return { success: false };
  }
}
