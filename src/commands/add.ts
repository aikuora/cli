import { existsSync } from 'fs';
import { resolve } from 'path';

import { loadToolConfig } from '../core/loader.js';
import { resolveTool } from '../core/resolver.js';
import { scanAllTools } from '../core/scanner.js';
import type { OutputOptions } from '../utils/output.js';
import { output, outputError } from '../utils/output.js';
import { readProjectFile } from '../utils/project-file.js';
import { validateWorkspace } from '../utils/workspace.js';
import { runRoot } from './add/root.js';
import { runLocal } from './add/local.js';
import { runShareable } from './add/shareable.js';
import { runLink } from './add/link.js';
import { runScaffold } from './add/scaffold.js';
import { runProjectDependency } from './add/project-dep.js';

export interface AddOptions extends OutputOptions {
  toolName: string;
  /** Target path for link / project-dependency mode */
  target?: string;
  /** App/package/module name for scaffold mode */
  name?: string;
  /** Variant name for link mode */
  variant?: string;
  /**
   * Fork a built-in tool into the local tools/ directory.
   * Note: currently also requires `customizable: true` in the tool config
   * (see TODO below in runLocal — tracked for removal in P1-04).
   */
  local?: boolean;
  cwd?: string;
  /** Suppress all output (used when running as a dependency via `requires`) */
  silent?: boolean;
}

// (runProjectDependency moved to src/commands/add/project-dep.ts)

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function addCommand(options: AddOptions) {
  const { local, name, target, toolName, json, cwd = process.cwd() } = options;
  const projectRoot = resolve(cwd);

  // STARTUP-001: validate workspace config before executing any command logic.
  const wsResult = validateWorkspace(projectRoot);
  if (!wsResult.valid) {
    if (json) output({ action: 'add', success: false, error: wsResult.error }, { json });
    else outputError(wsResult.error, { json });
    return { success: false };
  }

  if (local) return runLocal(options);
  if (name) return runScaffold(options);

  const customPaths = wsResult.config.customTools;
  const tools = scanAllTools(projectRoot, customPaths);

  if (target) {
    // Resolve once to distinguish: known tool → link, project path → project dependency
    if (resolveTool(toolName, tools)) {
      return runLink(options);
    }

    // Not a known tool — check if it's a workspace project path
    const sourceDir = resolve(projectRoot, toolName);
    if (existsSync(sourceDir) && readProjectFile(sourceDir)) {
      return runProjectDependency(options, projectRoot, sourceDir, tools);
    }

    const err = `'${toolName}' is not a known tool or project path`;
    if (json) output({ action: 'add', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  // No target, no name, no local — detect from tool kind
  const discovered = resolveTool(toolName, tools);
  if (!discovered) {
    const err = `Tool '${toolName}' not found in registry`;
    if (json) output({ action: 'add', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const loaderResult = loadToolConfig(discovered.path);
  if (loaderResult.success) {
    const kind = loaderResult.data?.kind;
    if (kind === 'shareable') return runShareable(options);
    if (kind === 'root') return runRoot(options);
  }

  const err =
    'Ambiguous usage: provide --name to scaffold, a target path to link, or --local to fork';
  if (json) output({ action: 'add', success: false, error: err }, { json });
  else outputError(err, { json });
  return { success: false };
}
