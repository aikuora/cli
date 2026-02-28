import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

import Handlebars from 'handlebars';

import { readConfig } from '../../managers/config.js';
import { addMoonTask } from '../../utils/moon.js';
import { output, outputError, outputSuccess } from '../../utils/output.js';
import { sortDeps } from '../../utils/integration-patches.js';
import { applyWorkspaceSettings } from '../../utils/workspace-integrations.js';
import { appendToolDependency } from '../../utils/project-file.js';
import type { AddOptions } from '../add.js';
import { ensureConfigsEntry } from './configs-entry.js';
import { ensureRequiredTools } from './root.js';
import { loadResolvedTool } from './shared.js';

// ---------------------------------------------------------------------------
// Private helper (module-internal)
// ---------------------------------------------------------------------------

function readJsonFile<T extends Record<string, unknown>>(p: string): T {
  if (!existsSync(p)) return {} as T;
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Mode B: Link (tool config → target project)
// ---------------------------------------------------------------------------

export async function runLink(options: AddOptions) {
  const { toolName, target, variant: variantFlag, json, cwd = process.cwd() } = options;
  const projectRoot = resolve(cwd);

  const configResult = readConfig();
  if (!configResult.success) {
    const err = configResult.error?.message ?? 'Could not read project config';
    if (json) output({ action: 'add', mode: 'link', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const rootConfig = configResult.data!;

  const resolved = await loadResolvedTool(
    toolName,
    projectRoot,
    rootConfig.customTools,
    json,
    'link'
  );
  if (!resolved.success) return { success: false };
  const { discovered, toolConfig } = resolved;

  // Ensure required tools (e.g. pnpm) are set up before linking
  if (toolConfig.requires && toolConfig.requires.length > 0) {
    await ensureRequiredTools(toolConfig.requires, options);
  }

  if (!toolConfig.link) {
    const err = `Tool '${toolName}' does not support link mode`;
    if (json) output({ action: 'add', mode: 'link', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const linkConfig = toolConfig.link;
  const variants = linkConfig.variants ?? [];

  // Resolve variant: --variant flag → default → first
  let resolvedVariant: string | null = null;
  let resolvedVariantObj: (typeof variants)[0] | undefined;
  if (variantFlag) {
    resolvedVariantObj = variants.find((v) => v.name === variantFlag);
    resolvedVariant = resolvedVariantObj?.name ?? variantFlag;
  } else {
    resolvedVariantObj = variants.find((v) => v.default) ?? variants[0];
    resolvedVariant = resolvedVariantObj?.name ?? null;
  }

  const scope = rootConfig.project.scope;

  // For shareable tools, ensure the shared package exists before linking
  let packageName: string | undefined;
  let configsName: string | undefined;
  if (toolConfig.kind === 'shareable') {
    const shared = await ensureConfigsEntry(
      toolName,
      discovered.path,
      projectRoot,
      rootConfig.structure.packages,
      scope
    );
    packageName = shared.packageName;
    configsName = shared.configsName;
  }

  // Use variant's content override if provided, otherwise use link.content
  const contentTemplate = resolvedVariantObj?.content ?? linkConfig.content;
  const templateSource = Handlebars.compile(contentTemplate);
  const rendered = templateSource({ scope, variant: resolvedVariant, packageName });

  const targetPath = resolve(projectRoot, target!);
  await mkdir(targetPath, { recursive: true });
  await writeFile(join(targetPath, linkConfig.targetFile), rendered, 'utf-8');

  // Add the base configs package (e.g. "@scope/configs") to the target's devDependencies.
  // All shareable tools live inside this single package — one entry covers them all.
  if (configsName) {
    const targetPkgPath = join(targetPath, 'package.json');
    if (existsSync(targetPkgPath)) {
      const targetPkg = readJsonFile<Record<string, unknown>>(targetPkgPath);
      const devDeps = (targetPkg.devDependencies as Record<string, string>) ?? {};
      if (!(configsName in devDeps)) {
        devDeps[configsName] = 'workspace:*';
        targetPkg.devDependencies = sortDeps(devDeps);
        await writeFile(targetPkgPath, JSON.stringify(targetPkg, null, 2) + '\n', 'utf-8');
      }
    }
  }

  // Apply all workspace integrations: vscode settings/extensions, claude hooks, moon tasks
  const moonTasksAdded: string[] = [];
  if (toolConfig.workspace) {
    await applyWorkspaceSettings(projectRoot, toolConfig.workspace, toolName);
    if (toolConfig.workspace.moon) {
      moonTasksAdded.push(...toolConfig.workspace.moon.tasks.map((t) => t.name));
    }
  }

  // Per-project moon tasks from linkConfig (only when tool has no workspace-level moon config)
  if (!toolConfig.workspace?.moon) {
    for (const task of linkConfig.moonTasks ?? []) {
      await addMoonTask(join(targetPath, 'moon.yml'), task);
      moonTasksAdded.push(task.name);
    }
  }

  // Update target's project file if it exists
  await appendToolDependency(targetPath, toolName);

  const result = {
    action: 'add',
    mode: 'link',
    success: true,
    tool: toolName,
    target,
    configFile: linkConfig.targetFile,
    variant: resolvedVariant,
    moonTasksAdded,
  };

  if (json) output(result, { json });
  else
    outputSuccess(
      `Linked ${toolName} to ${target} (${linkConfig.targetFile})${moonTasksAdded.length > 0 ? ` [moon: ${moonTasksAdded.join(', ')}]` : ''}`,
      { json }
    );

  return result;
}
