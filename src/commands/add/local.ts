import { existsSync } from 'fs';
import { join, resolve } from 'path';

import fse from 'fs-extra';

import { loadToolConfig } from '../../core/loader.js';
import { resolveTool } from '../../core/resolver.js';
import { scanBuiltInTools } from '../../core/scanner.js';
import { output, outputError, outputSuccess } from '../../utils/output.js';
import type { AddOptions } from '../add.js';

// ---------------------------------------------------------------------------
// Mode C: Local fork
// ---------------------------------------------------------------------------

export async function runLocal(options: AddOptions) {
  const { toolName, json, cwd = process.cwd() } = options;
  const projectRoot = resolve(cwd);

  const builtInTools = scanBuiltInTools();
  const discovered = resolveTool(toolName, builtInTools);

  if (!discovered) {
    const err = `Tool '${toolName}' not found in built-in tools`;
    if (json) output({ action: 'add', mode: 'local', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const loaderResult = loadToolConfig(discovered.path);
  if (!loaderResult.success) {
    const err = loaderResult.error?.message ?? 'Could not load tool config';
    if (json) output({ action: 'add', mode: 'local', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const toolConfig = loaderResult.data!;

  // TODO(P1-04): Remove this gate — spec says any built-in tool can be forked via --local.
  // customizable is not a spec concept; this check will be removed in P1-04.
  if (!toolConfig.customizable) {
    const err = `Tool '${toolName}' does not support --local`;
    if (json) output({ action: 'add', mode: 'local', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const destination = join(projectRoot, 'tools', toolName);

  if (existsSync(destination)) {
    const err = `Tool already exists locally: tools/${toolName}`;
    if (json) output({ action: 'add', mode: 'local', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  await fse.copy(discovered.path, destination);

  const result = {
    action: 'add',
    mode: 'local',
    success: true,
    tool: toolName,
    destination: `tools/${toolName}`,
  };

  if (json) output(result, { json });
  else outputSuccess(`Forked '${toolName}' to tools/${toolName}`, { json });

  return result;
}
