import { existsSync } from 'fs';
import { resolve } from 'path';

import { scanAllTools } from '../../core/scanner.js';
import { readConfig } from '../../managers/config.js';
import { invokeIntegrationHandler } from '../../utils/integration.js';
import { output, outputError, outputSuccess } from '../../utils/output.js';
import { appendProjectDependency, readProjectFile } from '../../utils/project-file.js';
import type { AddOptions } from '../add.js';

// ---------------------------------------------------------------------------
// Mode D: Project dependency (workspace package → target project)
// ---------------------------------------------------------------------------

export async function runProjectDependency(
  options: AddOptions,
  projectRoot: string,
  sourceDir: string,
  tools: ReturnType<typeof scanAllTools>
) {
  const { toolName: sourceName, target, json } = options;

  if (!target) {
    const err = 'Target project path is required: aikuora add <package> <target>';
    if (json) output({ action: 'add', mode: 'project', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const configResult = readConfig();
  if (!configResult.success) {
    const err = configResult.error?.message ?? 'Could not read project config';
    if (json) output({ action: 'add', mode: 'project', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const rootConfig = configResult.data!;
  const scope = rootConfig.project.scope;

  const targetDir = resolve(projectRoot, target);

  if (!existsSync(targetDir)) {
    const err = `Target project not found: ${target}`;
    if (json) output({ action: 'add', mode: 'project', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const targetProject = readProjectFile(targetDir);
  if (!targetProject) {
    const err = `Target has no aikuora.project.yml: ${target}`;
    if (json) output({ action: 'add', mode: 'project', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  // Derive scoped package name from source directory name
  const dirName = sourceDir.split('/').pop() ?? sourceName;
  const scopedName = scope ? `${scope}/${dirName}` : dirName;

  // Try to invoke an integration handler
  let handlerInvoked = false;
  try {
    handlerInvoked = await invokeIntegrationHandler({
      sourceDir,
      targetDir,
      sourceName,
      scopedName,
      tools,
      workspaceRoot: projectRoot,
      scope,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Integration handler failed';
    if (json) output({ action: 'add', mode: 'project', success: false, error: msg }, { json });
    else outputError(msg, { json });
    return { success: false };
  }

  // Record the dependency in the target's project file
  await appendProjectDependency(targetDir, sourceName);

  const result = {
    action: 'add',
    mode: 'project',
    success: true,
    source: sourceName,
    target,
    scopedName,
    handlerInvoked,
  };

  if (json) output(result, { json });
  else
    outputSuccess(
      `Added ${sourceName} as dependency of ${target}${handlerInvoked ? ' (integration handler applied)' : ''}`,
      { json }
    );

  return result;
}
