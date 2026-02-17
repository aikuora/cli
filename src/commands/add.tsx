import { existsSync } from 'fs';
import { join, resolve } from 'path';

import fse from 'fs-extra';
import Handlebars from 'handlebars';
import { Text } from 'ink';

import { loadToolConfig } from '../core/loader.js';
import { resolveTool } from '../core/resolver.js';
import { scanAllTools, scanBuiltInTools } from '../core/scanner.js';
import { readConfig } from '../managers/config.js';
import type { MoonTask } from '../types/tool-config.js';
import { addMoonTask, buildMoonConfig, writeMoonYml } from '../utils/moon.js';
import type { OutputOptions } from '../utils/output.js';
import { output, outputError, outputSuccess } from '../utils/output.js';
import { invokeIntegrationHandler } from '../utils/integration.js';
import { updatePrototools } from '../utils/prototools.js';
import { appendProjectDependency, appendToolDependency, readProjectFile, writeProjectFile } from '../utils/project-file.js';
import { copyTemplate } from '../utils/template.js';

export interface AddOptions extends OutputOptions {
  toolName: string;
  /** Target path for link / project-dependency mode */
  target?: string;
  /** App/package/module name for scaffold mode */
  name?: string;
  /** Variant name for link mode */
  variant?: string;
  /** Fork built-in to tools/ (requires customizable: true) */
  local?: boolean;
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Mode A: Scaffold
// ---------------------------------------------------------------------------

async function runScaffold(options: AddOptions) {
  const { toolName, name: appName, json, cwd = process.cwd() } = options;
  const projectRoot = resolve(cwd);

  const configResult = readConfig();
  if (!configResult.success) {
    const err = configResult.error?.message ?? 'Could not read project config';
    if (json) output({ action: 'add', mode: 'scaffold', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const rootConfig = configResult.data!;
  const tools = scanAllTools(projectRoot, rootConfig.customTools);
  const discovered = resolveTool(toolName, tools);

  if (!discovered) {
    const err = `Tool '${toolName}' not found`;
    if (json) output({ action: 'add', mode: 'scaffold', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const loaderResult = loadToolConfig(discovered.path);
  if (!loaderResult.success) {
    const err = loaderResult.error?.message ?? 'Could not load tool config';
    if (json) output({ action: 'add', mode: 'scaffold', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const toolConfig = loaderResult.data!;

  if (!toolConfig.scaffold) {
    const err = `Tool '${toolName}' does not support scaffold mode`;
    if (json) output({ action: 'add', mode: 'scaffold', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const scaffold = toolConfig.scaffold;
  const typeDir =
    scaffold.type === 'app'
      ? rootConfig.structure.apps
      : scaffold.type === 'package'
        ? rootConfig.structure.packages
        : rootConfig.structure.modules;

  const targetDir = join(projectRoot, typeDir, appName!);

  if (existsSync(targetDir)) {
    const err = `Directory already exists: ${targetDir}`;
    if (json) output({ action: 'add', mode: 'scaffold', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const scope = rootConfig.project.scope;
  const scopedName = scope ? `${scope}/${appName}` : appName!;

  const templateContext = {
    name: appName,
    scope,
    scopedName,
    type: scaffold.type,
    tool: toolName,
    dir: typeDir,
    year: new Date().getFullYear(),
  };

  await copyTemplate(`${toolName}/templates`, targetDir, templateContext);

  const moonConfig = buildMoonConfig(scaffold.moonTasks);
  await writeMoonYml(join(targetDir, 'moon.yml'), moonConfig);

  if (Object.keys(toolConfig.prototools).length > 0) {
    await updatePrototools(join(projectRoot, '.prototools'), toolConfig.prototools);
  }

  // Auto-link devtools
  const linkedTools: string[] = [];
  for (const devTool of scaffold.devtools) {
    const linkResult = await runLink({
      ...options,
      toolName: devTool,
      target: join(typeDir, appName!),
      name: undefined,
      local: false,
    });
    if (linkResult.success) {
      linkedTools.push(devTool);
    }
  }

  // Write aikuora.project.yml
  await writeProjectFile(targetDir, {
    tool: toolName,
    type: scaffold.type,
    dependencies: { tools: linkedTools, projects: [] },
  });

  const moonTasksCreated = scaffold.moonTasks.map((t: MoonTask) => t.name);

  const result = {
    action: 'add',
    mode: 'scaffold',
    success: true,
    tool: toolName,
    name: appName,
    path: join(typeDir, appName!),
    linkedTools,
    prototoolsUpdated: Object.keys(toolConfig.prototools).length > 0,
    moonTasksCreated,
  };

  if (json) output(result, { json });
  else outputSuccess(`Scaffolded ${toolName} app '${appName}' at ${join(typeDir, appName!)}`, { json });

  return result;
}

// ---------------------------------------------------------------------------
// Mode B: Link (tool config → target project)
// ---------------------------------------------------------------------------

async function runLink(options: AddOptions) {
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
  const tools = scanAllTools(projectRoot, rootConfig.customTools);
  const discovered = resolveTool(toolName, tools);

  if (!discovered) {
    const err = `Tool '${toolName}' not found`;
    if (json) output({ action: 'add', mode: 'link', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const loaderResult = loadToolConfig(discovered.path);
  if (!loaderResult.success) {
    const err = loaderResult.error?.message ?? 'Could not load tool config';
    if (json) output({ action: 'add', mode: 'link', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const toolConfig = loaderResult.data!;

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
  if (variantFlag) {
    const found = variants.find((v) => v.name === variantFlag);
    resolvedVariant = found?.name ?? variantFlag;
  } else {
    const defaultVariant = variants.find((v) => v.default);
    resolvedVariant = defaultVariant?.name ?? (variants[0]?.name ?? null);
  }

  const scope = rootConfig.project.scope;
  const templateSource = Handlebars.compile(linkConfig.content);
  const rendered = templateSource({ scope, variant: resolvedVariant });

  const { writeFile, mkdir } = await import('fs/promises');
  const targetPath = resolve(projectRoot, target!);
  await mkdir(targetPath, { recursive: true });
  await writeFile(join(targetPath, linkConfig.targetFile), rendered, 'utf-8');

  let moonTaskAdded = false;
  if (linkConfig.moonTask) {
    await addMoonTask(join(targetPath, 'moon.yml'), linkConfig.moonTask);
    moonTaskAdded = true;
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
    moonTaskAdded,
  };

  if (json) output(result, { json });
  else outputSuccess(`Linked ${toolName} to ${target} (${linkConfig.targetFile})`, { json });

  return result;
}

// ---------------------------------------------------------------------------
// Mode C: Local fork
// ---------------------------------------------------------------------------

async function runLocal(options: AddOptions) {
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

// ---------------------------------------------------------------------------
// Mode D: Project dependency (workspace package → target project)
// ---------------------------------------------------------------------------

async function runProjectDependency(
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

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function addCommand(options: AddOptions) {
  const { local, name, target, toolName, json, cwd = process.cwd() } = options;
  const projectRoot = resolve(cwd);

  if (local) return runLocal(options);
  if (name) return runScaffold(options);

  if (target) {
    // Resolve once to distinguish: known tool → link, project path → project dependency
    const configResult = readConfig();
    const customPaths = configResult.data?.customTools ?? [];
    const tools = scanAllTools(projectRoot, customPaths);

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

  const err =
    'Ambiguous usage: provide --name to scaffold, a target path to link, or --local to fork';
  if (json) output({ action: 'add', success: false, error: err }, { json });
  else outputError(err, { json });
  return { success: false };
}

// ---------------------------------------------------------------------------
// Ink component
// ---------------------------------------------------------------------------

export function AddCommand({
  mode,
  toolName,
  name,
  target,
}: {
  mode: 'scaffold' | 'link' | 'local' | 'project';
  toolName: string;
  name?: string;
  target?: string;
}) {
  if (mode === 'scaffold') {
    return (
      <Text color="cyan">
        Scaffolding {toolName} app: {name}
      </Text>
    );
  }

  if (mode === 'link') {
    return (
      <Text color="cyan">
        Linking {toolName} to {target}
      </Text>
    );
  }

  if (mode === 'project') {
    return (
      <Text color="cyan">
        Adding {toolName} as dependency of {target}
      </Text>
    );
  }

  return (
    <Text color="cyan">
      Forking {toolName} to tools/{toolName}
    </Text>
  );
}
