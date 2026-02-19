import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
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
import { pinProtoVersion, updatePrototools } from '../utils/prototools.js';
import { appendProjectDependency, appendToolDependency, readProjectFile, writeProjectFile } from '../utils/project-file.js';
import { renderAndCopy } from '../utils/template.js';

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
  /** Suppress all output (used when running as a dependency via `requires`) */
  silent?: boolean;
}

// ---------------------------------------------------------------------------
// Mode R: Root tool setup (kind: root)
// ---------------------------------------------------------------------------

async function runRoot(options: AddOptions): Promise<{ success: boolean }> {
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
  const tools = scanAllTools(projectRoot, rootConfig.customTools);
  const discovered = resolveTool(toolName, tools);

  if (!discovered) {
    const err = `Tool '${toolName}' not found`;
    if (!silent) {
      if (json) output({ action: 'add', mode: 'root', success: false, error: err }, { json });
      else outputError(err, { json });
    }
    return { success: false };
  }

  const loaderResult = loadToolConfig(discovered.path);
  if (!loaderResult.success) {
    const err = loaderResult.error?.message ?? 'Could not load tool config';
    if (!silent) {
      if (json) output({ action: 'add', mode: 'root', success: false, error: err }, { json });
      else outputError(err, { json });
    }
    return { success: false };
  }

  const toolConfig = loaderResult.data!;

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
      structure: rootConfig.structure,
      defaults: rootConfig.defaults,
      project: rootConfig.project,
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
    await applyWorkspaceSettings(projectRoot, toolConfig.workspace);
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
async function ensureRequiredTools(requires: string[], baseOptions: AddOptions): Promise<void> {
  for (const reqTool of requires) {
    await runRoot({ ...baseOptions, toolName: reqTool, silent: true });
  }
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

  const templateDir = join(discovered.path, 'templates');
  if (existsSync(templateDir)) {
    await renderAndCopy(templateDir, targetDir, templateContext);
  }

  const moonConfig = buildMoonConfig(scaffold.moonTasks, toolConfig.lang ?? undefined);
  await writeMoonYml(join(targetDir, 'moon.yml'), moonConfig);

  if (Object.keys(toolConfig.prototools).length > 0) {
    await updatePrototools(join(projectRoot, '.prototools'), toolConfig.prototools);
  }

  // Auto-link devtools
  const linkedTools: string[] = [];
  for (const devToolEntry of scaffold.devtools) {
    const devToolName = typeof devToolEntry === 'string' ? devToolEntry : devToolEntry.tool;
    const devToolVariant = typeof devToolEntry === 'string' ? undefined : devToolEntry.variant;
    const linkResult = await runLink({
      ...options,
      toolName: devToolName,
      variant: devToolVariant,
      target: join(typeDir, appName!),
      name: undefined,
      local: false,
    });
    if (linkResult.success) {
      linkedTools.push(devToolName);
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
// package.json helpers
// ---------------------------------------------------------------------------

function sortDeps(deps: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

// Determine the correct package.json export patterns for a shareable tool.
// Node.js exports only allow ONE * per pattern, so we use per-tool paths:
//   prettier  (index.mjs only) → "./prettier"         → ./src/prettier/index.mjs
//   eslint    (.mjs variants)  → "./eslint/*"         → ./src/eslint/*.mjs
//   tsconfig  (.json files)    → "./tsconfig/*.json"  → ./src/tsconfig/*.json
function buildToolExportPatterns(toolName: string, templateDir: string): Record<string, string> {
  if (!existsSync(templateDir)) return {};

  const files = readdirSync(templateDir).filter(
    (f) => f !== 'package.json' && !statSync(join(templateDir, f)).isDirectory()
  );

  const mjsFiles = files.filter((f) => f.endsWith('.mjs'));
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const patterns: Record<string, string> = {};

  if (mjsFiles.length === 1 && mjsFiles[0] === 'index.mjs') {
    // Single entry point: @scope/configs/prettier
    patterns[`./${toolName}`] = `./src/${toolName}/index.mjs`;
  } else if (mjsFiles.length > 0) {
    // Multiple variants: @scope/configs/eslint/typescript
    patterns[`./${toolName}/*`] = `./src/${toolName}/*.mjs`;
  }

  if (jsonFiles.length > 0) {
    // JSON configs: @scope/configs/tsconfig/base.json
    patterns[`./${toolName}/*.json`] = `./src/${toolName}/*.json`;
  }

  return patterns;
}

/**
 * Add peerDependencies from a package to the root workspace package.json devDependencies.
 * Skips keys that are already present. No-ops if root package.json doesn't exist.
 */
async function ensureRootPeerDeps(
  projectRoot: string,
  peerDeps: Record<string, string>
): Promise<void> {
  const rootPkgPath = join(projectRoot, 'package.json');
  if (!existsSync(rootPkgPath)) return;

  const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8')) as Record<string, unknown>;
  const devDeps = (rootPkg.devDependencies as Record<string, string>) ?? {};

  let changed = false;
  for (const [dep, version] of Object.entries(peerDeps)) {
    if (!(dep in devDeps)) {
      devDeps[dep] = version;
      changed = true;
    }
  }

  if (changed) {
    rootPkg.devDependencies = sortDeps(devDeps);
    await writeFile(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf-8');
  }
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
  /** Full import path used in config files, e.g. scope/configs/prettier */
  packageName: string;
  /** Package name for devDependencies, e.g. scope/configs */
  configsName: string;
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
      private: true,
      type: 'module',
      exports: {},
    };
  } else {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
  }

  // Build per-tool export patterns (one * per pattern — Node.js requirement).
  const currentExports = (pkgJson.exports as Record<string, string>) ?? {};
  const toolPatterns = buildToolExportPatterns(toolName, join(toolPath, 'template'));
  for (const [pattern, target] of Object.entries(toolPatterns)) {
    if (!(pattern in currentExports)) currentExports[pattern] = target;
  }
  pkgJson.exports = currentExports;

  // Merge dependencies from tool's template/package.json (new keys only)
  const toolPkgJsonPath = join(toolPath, 'template', 'package.json');
  let peerDepsToPropagate: Record<string, string> = {};
  if (existsSync(toolPkgJsonPath)) {
    const toolPkg = JSON.parse(readFileSync(toolPkgJsonPath, 'utf-8')) as Record<string, unknown>;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      if (toolPkg[field] && typeof toolPkg[field] === 'object') {
        const merged = (pkgJson[field] as Record<string, string>) ?? {};
        for (const [dep, version] of Object.entries(toolPkg[field] as Record<string, string>)) {
          if (!(dep in merged)) merged[dep] = version;
        }
        pkgJson[field] = sortDeps(merged);
      }
    }
    if (toolPkg.peerDependencies && typeof toolPkg.peerDependencies === 'object') {
      peerDepsToPropagate = toolPkg.peerDependencies as Record<string, string>;
    }
  }
  await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');

  // Propagate peerDependencies to the root workspace package.json
  if (Object.keys(peerDepsToPropagate).length > 0) {
    await ensureRootPeerDeps(projectRoot, peerDepsToPropagate);
  }

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

  return { created, path: destToolDir, packageName, configsName: configsPkgName };
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

  // Ensure required tools (e.g. pnpm) are set up before creating shared packages
  if (toolConfig.requires && toolConfig.requires.length > 0) {
    await ensureRequiredTools(toolConfig.requires, options);
  }

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
      const targetPkg = JSON.parse(readFileSync(targetPkgPath, 'utf-8')) as Record<string, unknown>;
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
    await applyWorkspaceSettings(projectRoot, toolConfig.workspace);
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
        if (kind === 'root') return runRoot(options);
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
