import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

import fse from 'fs-extra';
import Handlebars from 'handlebars';
import { Text } from 'ink';

import { loadToolConfig } from '../core/loader.js';
import { resolveTool } from '../core/resolver.js';
import { scanAllTools, scanBuiltInTools } from '../core/scanner.js';
import { readConfig } from '../managers/config.js';
import type { MoonTask } from '../types/tool-config.js';
import { addInheritedMoonTasks, addMoonTask, buildMoonConfig, writeMoonYml } from '../utils/moon.js';
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
// Workspace-level settings helpers
// ---------------------------------------------------------------------------

async function mergeJsonFile(filePath: string, patch: Record<string, unknown>): Promise<void> {
  let existing: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    existing = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  }
  const merged = { ...existing, ...patch };
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

async function mergeClaudeHooks(
  filePath: string,
  hooks: Record<string, Array<{ matcher: string; command: string }>>
): Promise<void> {
  let existing: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    existing = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  }
  const existingHooks = (existing.hooks as Record<string, Array<{ command: string }>>) ?? {};

  for (const [event, newHooks] of Object.entries(hooks)) {
    const current = existingHooks[event] ?? [];
    for (const hook of newHooks) {
      if (!current.some((h) => h.command === hook.command)) {
        current.push(hook);
      }
    }
    existingHooks[event] = current;
  }

  const merged = { ...existing, hooks: existingHooks };
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

import type { WorkspaceConfig } from '../types/tool-config.js';

async function mergeVscodeExtensions(filePath: string, extensions: string[]): Promise<void> {
  let existing: { recommendations?: string[] } = {};
  if (existsSync(filePath)) {
    existing = JSON.parse(readFileSync(filePath, 'utf-8')) as typeof existing;
  }
  const current = existing.recommendations ?? [];
  for (const ext of extensions) {
    if (!current.includes(ext)) current.push(ext);
  }
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, JSON.stringify({ ...existing, recommendations: current }, null, 2) + '\n', 'utf-8');
}

async function applyWorkspaceSettings(
  projectRoot: string,
  workspace: WorkspaceConfig
): Promise<void> {
  if (workspace.vscode?.settings) {
    await mergeJsonFile(
      join(projectRoot, '.vscode', 'settings.json'),
      workspace.vscode.settings
    );
  }
  if (workspace.vscode?.extensions) {
    await mergeVscodeExtensions(
      join(projectRoot, '.vscode', 'extensions.json'),
      workspace.vscode.extensions
    );
  }
  if (workspace.claude?.hooks) {
    await mergeClaudeHooks(
      join(projectRoot, '.claude', 'settings.json'),
      workspace.claude.hooks
    );
  }
  if (workspace.moon) {
    await addInheritedMoonTasks(projectRoot, workspace.moon);
  }
}

// ---------------------------------------------------------------------------
// Shared package helper (used by shareable tools)
// ---------------------------------------------------------------------------

interface SharedPackageResult {
  created: boolean;
  path: string;
  packageName: string;
}

async function ensureConfigsEntry(
  toolName: string,
  toolPath: string,
  projectRoot: string,
  packagesDir: string,
  scope: string | undefined
): Promise<SharedPackageResult> {
  const configsPkgDir = join(projectRoot, packagesDir, 'configs');
  const configsPkgName = scope ? `${scope}/configs` : 'configs';
  // Import path used in link.content: e.g. "@scope/configs/prettier"
  const packageName = `${configsPkgName}/${toolName}`;
  const destToolDir = join(configsPkgDir, 'src', toolName);

  // ── Step 1: Create or update packages/configs/package.json ───────────────
  const pkgJsonPath = join(configsPkgDir, 'package.json');
  let pkgJson: Record<string, unknown>;

  if (!existsSync(pkgJsonPath)) {
    await mkdir(configsPkgDir, { recursive: true });
    pkgJson = {
      name: configsPkgName,
      version: '0.0.0',
      type: 'module',
      exports: { './*': './src/*/index.mjs' },
    };
  } else {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
  }

  // Merge dependencies from tool's template/package.json (new keys only)
  const toolPkgJsonPath = join(toolPath, 'template', 'package.json');
  if (existsSync(toolPkgJsonPath)) {
    const toolPkg = JSON.parse(readFileSync(toolPkgJsonPath, 'utf-8')) as Record<string, unknown>;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      if (toolPkg[field] && typeof toolPkg[field] === 'object') {
        const existing = (pkgJson[field] as Record<string, string>) ?? {};
        for (const [dep, version] of Object.entries(toolPkg[field] as Record<string, string>)) {
          if (!(dep in existing)) existing[dep] = version;
        }
        pkgJson[field] = existing;
      }
    }
  }
  await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');

  // ── Step 2: Copy tool template/ files (excluding package.json) to src/<name>/ ──
  const created = !existsSync(destToolDir);
  if (created) {
    const templateDir = join(toolPath, 'template');
    if (!existsSync(templateDir)) {
      throw new Error(`Tool '${toolName}' has kind: shareable but no template/ directory`);
    }
    await fse.copy(templateDir, destToolDir, {
      filter: (src) => !src.endsWith('package.json'),
    });
  }

  // ── Step 3: Write aikuora.project.yml for packages/configs/ once ─────────
  if (!existsSync(join(configsPkgDir, 'aikuora.project.yml'))) {
    await writeProjectFile(configsPkgDir, {
      tool: 'configs',
      type: 'package',
      dependencies: { tools: [], projects: [] },
    });
  }

  return { created, path: destToolDir, packageName };
}

// ---------------------------------------------------------------------------
// Mode E: Shareable tool setup (aikuora add prettier — no target)
// ---------------------------------------------------------------------------

async function runShareable(options: AddOptions) {
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
  const tools = scanAllTools(projectRoot, rootConfig.customTools);
  const discovered = resolveTool(toolName, tools);

  if (!discovered) {
    const err = `Tool '${toolName}' not found`;
    if (json) output({ action: 'add', mode: 'shareable', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const loaderResult = loadToolConfig(discovered.path);
  if (!loaderResult.success) {
    const err = loaderResult.error?.message ?? 'Could not load tool config';
    if (json) output({ action: 'add', mode: 'shareable', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const toolConfig = loaderResult.data!;
  const scope = rootConfig.project.scope;
  const { created, packageName, path: entryPath } = await ensureConfigsEntry(
    toolName,
    discovered.path,
    projectRoot,
    rootConfig.structure.packages,
    scope
  );

  if (toolConfig.workspace) {
    await applyWorkspaceSettings(projectRoot, toolConfig.workspace);
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

  // For shareable tools, ensure the shared package exists before linking
  let packageName: string | undefined;
  if (toolConfig.kind === 'shareable') {
    const shared = await ensureConfigsEntry(
      toolName,
      discovered.path,
      projectRoot,
      rootConfig.structure.packages,
      scope
    );
    packageName = shared.packageName;
  }

  const templateSource = Handlebars.compile(linkConfig.content);
  const rendered = templateSource({ scope, variant: resolvedVariant, packageName });

  const targetPath = resolve(projectRoot, target!);
  await mkdir(targetPath, { recursive: true });
  await writeFile(join(targetPath, linkConfig.targetFile), rendered, 'utf-8');

  const moonTasksAdded: string[] = [];
  if (toolConfig.workspace?.moon) {
    // Tasks are workspace-inherited — write to .moon/tasks/<file>.yml
    await addInheritedMoonTasks(projectRoot, toolConfig.workspace.moon);
    moonTasksAdded.push(...toolConfig.workspace.moon.tasks.map((t) => t.name));
  } else {
    // Per-project tasks — write to target moon.yml
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

  // No target, no name, no local — detect from tool kind
  {
    const configResult = readConfig();
    const customPaths = configResult.data?.customTools ?? [];
    const allTools = scanAllTools(projectRoot, customPaths);
    const discovered = resolveTool(toolName, allTools);

    if (discovered) {
      const loaderResult = loadToolConfig(discovered.path);
      if (loaderResult.success) {
        const kind = loaderResult.data?.kind;
        if (kind === 'shareable') return runShareable(options);
        if (kind === 'root') {
          const err = `'root' kind is not yet implemented`;
          if (json) output({ action: 'add', success: false, error: err }, { json });
          else outputError(err, { json });
          return { success: false };
        }
      }
    }
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
  mode: 'scaffold' | 'link' | 'local' | 'project' | 'install';
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

  if (mode === 'install') {
    return <Text color="cyan">Installing {toolName}…</Text>;
  }

  return (
    <Text color="cyan">
      Forking {toolName} to tools/{toolName}
    </Text>
  );
}
