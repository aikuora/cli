import { existsSync } from 'fs';
import { join, resolve } from 'path';

import { readConfig } from '../../managers/config.js';
import { output, outputError, outputSuccess } from '../../utils/output.js';
import { applyWorkspaceSettings } from '../../utils/workspace-integrations.js';
import { pinProtoVersion } from '../../utils/prototools.js';
import { renderAndCopy } from '../../utils/template.js';
import type { AddOptions } from '../add.js';
import { loadResolvedTool } from './shared.js';

// ---------------------------------------------------------------------------
// Mode R: Root tool setup (kind: root)
// ---------------------------------------------------------------------------

export async function runRoot(options: AddOptions): Promise<{ success: boolean }> {
  const { toolName, json, silent, cwd = process.cwd() } = options;
  const projectRoot = resolve(cwd);

  const configResult = readConfig();
  if (!configResult.success) {
    const err = configResult.error?.message ?? 'Could not read project config';
    if (!silent) {
      if (json) output({ action: 'add', mode: 'root', success: false, error: err }, { json });
      else outputError(err, { json });
    }
    return { success: false };
  }

  const rootConfig = configResult.data!;

  const resolved = await loadResolvedTool(
    toolName,
    projectRoot,
    rootConfig.customTools,
    json,
    'root',
    silent
  );
  if (!resolved.success) return { success: false };
  const { discovered, toolConfig } = resolved;

  if (toolConfig.kind !== 'root') {
    const err = `Tool '${toolName}' is not a root tool (kind: ${toolConfig.kind})`;
    if (!silent) {
      if (json) output({ action: 'add', mode: 'root', success: false, error: err }, { json });
      else outputError(err, { json });
    }
    return { success: false };
  }

  // Ensure required root tools are set up first (e.g. pnpm requires node)
  if (toolConfig.requires && toolConfig.requires.length > 0) {
    await ensureRequiredTools(toolConfig.requires, options);
  }

  // Render template/ files to project root.
  // skipExisting: true — never overwrite user-modified files (package.json, etc.) on re-runs.
  const templateDir = join(discovered.path, 'template');
  if (existsSync(templateDir)) {
    const context = {
      name: rootConfig.name,
      scope: rootConfig.scope,
      structure: rootConfig.structure,
      defaults: rootConfig.defaults,
    };
    await renderAndCopy(templateDir, projectRoot, context as Record<string, unknown>, {
      skipExisting: true,
    });
  }

  // Pin version in .prototools using proto pin --resolve so the real version is stored
  if (toolConfig.installer === 'proto') {
    const defaults = rootConfig.defaults as Record<string, string>;
    const version = defaults[toolName] ?? toolConfig.version ?? 'latest';
    await pinProtoVersion(projectRoot, toolName, version);
  }

  // Apply workspace settings (vscode, claude hooks, moon tasks)
  if (toolConfig.workspace) {
    await applyWorkspaceSettings(projectRoot, toolConfig.workspace, toolName);
  }

  const result = { action: 'add', mode: 'root', success: true, tool: toolName };

  if (!silent) {
    if (json) output(result, { json });
    else outputSuccess(`Configured ${toolName} at workspace root`, { json });
  }

  return { success: true };
}

/**
 * Ensure all tools listed in `requires` are set up as root tools before proceeding.
 * Runs silently — the caller is responsible for reporting its own success.
 */
export async function ensureRequiredTools(
  requires: string[],
  baseOptions: AddOptions
): Promise<void> {
  for (const reqTool of requires) {
    await runRoot({ ...baseOptions, toolName: reqTool, silent: true });
  }
}
