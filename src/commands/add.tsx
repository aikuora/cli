import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

import fse from 'fs-extra';
import Handlebars from 'handlebars';
import { Text } from 'ink';

import { loadToolConfig } from '../core/loader.js';
import { resolveTool } from '../core/resolver.js';
import { scanAllTools } from '../core/scanner.js';
import { readConfig } from '../managers/config.js';
import type { Config } from '../types/config.js';
import type { MoonTask } from '../types/tool-config.js';
import { addMoonTask, buildMoonConfig, writeMoonYml } from '../utils/moon.js';
import type { OutputOptions } from '../utils/output.js';
import { output, outputError, outputSuccess } from '../utils/output.js';
import { invokeIntegrationHandler } from '../utils/integration.js';
import { applyWorkspaceSettings } from '../utils/workspace-integrations.js';
import { ensureRootPeerDeps, injectCssImport, patchTsconfigPaths, patchTsconfigReferences, sortDeps } from '../utils/integration-patches.js';
import { updatePrototools } from '../utils/prototools.js';
import { appendProjectDependency, appendToolDependency, readProjectFile, writeProjectFile } from '../utils/project-file.js';
import { renderAndCopy } from '../utils/template.js';
import { loadResolvedTool } from './add/shared.js';
import { ensureRequiredTools, runRoot } from './add/root.js';
import { runLocal } from './add/local.js';

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

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Read a JSON file and return its contents cast to T.
 * Returns an empty object if the file does not exist.
 */
function readJsonFile<T extends Record<string, unknown>>(p: string): T {
  if (!existsSync(p)) return {} as T;
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

// (loadResolvedTool moved to src/commands/add/shared.ts)
// (runRoot + ensureRequiredTools moved to src/commands/add/root.ts)

// (tsconfig / CSS helpers moved to src/utils/integration-patches.ts)

// ---------------------------------------------------------------------------
// Workspace package helper (used by scaffold.packages)
// ---------------------------------------------------------------------------

/**
 * Ensure a workspace package exists for the given scaffold tool.
 * If the package directory does not exist yet, scaffolds it first.
 * Returns the scoped package name to add as a workspace dependency.
 */
async function ensureWorkspacePackage(
  pkgToolName: string,
  baseOptions: AddOptions,
  projectRoot: string,
  rootConfig: Config
): Promise<{ success: boolean; scopedName: string }> {
  const tools = scanAllTools(projectRoot, rootConfig.customTools);
  const discovered = resolveTool(pkgToolName, tools);
  if (!discovered) return { success: false, scopedName: '' };

  const loaderResult = loadToolConfig(discovered.path);
  if (!loaderResult.success || !loaderResult.data?.scaffold) {
    return { success: false, scopedName: '' };
  }

  const pkgScaffold = loaderResult.data.scaffold;
  const typeDir =
    pkgScaffold.type === 'package'
      ? rootConfig.structure.packages
      : rootConfig.structure.modules;

  const targetDir = join(projectRoot, typeDir, pkgToolName);
  const scope = rootConfig.project.scope;
  const scopedName = scope ? `${scope}/${pkgToolName}` : pkgToolName;

  if (!existsSync(targetDir)) {
    await runScaffold({ ...baseOptions, toolName: pkgToolName, name: pkgToolName });
  }

  // Add self-referential paths so the package can use its own scoped name as imports
  await patchTsconfigPaths(join(targetDir, 'tsconfig.json'), scopedName, './src');

  return { success: true, scopedName };
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

  const resolved = await loadResolvedTool(
    toolName,
    projectRoot,
    rootConfig.customTools,
    json,
    'scaffold'
  );
  if (!resolved.success) return { success: false };
  const { discovered, toolConfig } = resolved;

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

  const moonConfig = buildMoonConfig(scaffold.moonTasks, toolConfig.lang ?? undefined, scaffold.tags);
  await writeMoonYml(join(targetDir, 'moon.yml'), moonConfig);

  // Apply workspace-level integrations declared by the scaffold tool itself
  // (e.g. ui writes .moon/tasks/shadcn.yml via workspace.moon)
  if (toolConfig.workspace) {
    await applyWorkspaceSettings(projectRoot, toolConfig.workspace, toolName);
  }

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

  // Auto-scaffold workspace packages and wire them as dependencies
  const packagedTools: string[] = [];
  for (const pkgToolName of scaffold.packages ?? []) {
    const pkgResult = await ensureWorkspacePackage(pkgToolName, options, projectRoot, rootConfig);
    if (pkgResult.success) {
      packagedTools.push(pkgToolName);

      // Add as runtime dependency in package.json
      const targetPkgPath = join(targetDir, 'package.json');
      if (existsSync(targetPkgPath)) {
        const targetPkg = readJsonFile<Record<string, unknown>>(targetPkgPath);
        const deps = (targetPkg.dependencies as Record<string, string>) ?? {};
        if (!(pkgResult.scopedName in deps)) {
          deps[pkgResult.scopedName] = 'workspace:*';
          targetPkg.dependencies = sortDeps(deps);
          await writeFile(targetPkgPath, JSON.stringify(targetPkg, null, 2) + '\n', 'utf-8');
        }
      }

      // Add a TypeScript project reference so the app can consume the workspace package
      const refPath = `../../${rootConfig.structure.packages}/${pkgToolName}`;
      await patchTsconfigReferences(join(targetDir, 'tsconfig.json'), refPath);

      // Inject CSS import if the app declares a cssEntry and the package exports a globals.css
      if (scaffold.cssEntry) {
        const pkgGlobalsPath = join(
          projectRoot,
          rootConfig.structure.packages,
          pkgToolName,
          'src', 'styles', 'globals.css'
        );
        if (existsSync(pkgGlobalsPath)) {
          await injectCssImport(join(targetDir, scaffold.cssEntry), pkgResult.scopedName);
        }
      }
    }
  }

  // Write aikuora.project.yml — must happen before integration handlers,
  // which read this file to resolve the target tool name.
  await writeProjectFile(targetDir, {
    tool: toolName,
    type: scaffold.type,
    dependencies: { tools: linkedTools, projects: packagedTools },
  });

  // Invoke integration handlers for each wired workspace package.
  // Both aikuora.project.yml files now exist so invokeIntegrationHandler can resolve them.
  for (const pkgToolName of packagedTools) {
    const pkgAbsPath = join(projectRoot, rootConfig.structure.packages, pkgToolName);
    const pkgRelPath = `${rootConfig.structure.packages}/${pkgToolName}`;
    const pkgScopedName = rootConfig.project.scope
      ? `${rootConfig.project.scope}/${pkgToolName}`
      : pkgToolName;
    await invokeIntegrationHandler({
      sourceDir: pkgAbsPath,
      targetDir,
      sourceName: pkgRelPath,
      scopedName: pkgScopedName,
      tools: resolved.tools,
      workspaceRoot: projectRoot,
      scope: rootConfig.project.scope,
    });
  }

  const moonTasksCreated = scaffold.moonTasks.map((t: MoonTask) => t.name);

  const result = {
    action: 'add',
    mode: 'scaffold',
    success: true,
    tool: toolName,
    name: appName,
    path: join(typeDir, appName!),
    linkedTools,
    packagedTools,
    prototoolsUpdated: Object.keys(toolConfig.prototools).length > 0,
    moonTasksCreated,
  };

  if (json) output(result, { json });
  else outputSuccess(`Scaffolded ${toolName} app '${appName}' at ${join(typeDir, appName!)}`, { json });

  return result;
}

// (sortDeps moved to src/utils/integration-patches.ts)

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

// (ensureRootPeerDeps moved to src/utils/integration-patches.ts)

// (workspace integration helpers moved to src/utils/workspace-integrations.ts)

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
    pkgJson = readJsonFile<Record<string, unknown>>(pkgJsonPath);
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
    const toolPkg = readJsonFile<Record<string, unknown>>(toolPkgJsonPath);
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

  const scope = rootConfig.project.scope;
  const { created, packageName, path: entryPath } = await ensureConfigsEntry(
    toolName,
    discovered.path,
    projectRoot,
    rootConfig.structure.packages,
    scope
  );

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

// (runLocal moved to src/commands/add/local.ts)

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

  // Hoist a single readConfig() call shared by both branches below.
  const configResult = readConfig();
  const customPaths = configResult.data?.customTools ?? [];
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
  if (discovered) {
    const loaderResult = loadToolConfig(discovered.path);
    if (loaderResult.success) {
      const kind = loaderResult.data?.kind;
      if (kind === 'shareable') return runShareable(options);
      if (kind === 'root') return runRoot(options);
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
  mode: 'scaffold' | 'link' | 'local' | 'project' | 'root-or-shareable';
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

  if (mode === 'root-or-shareable') {
    return <Text color="cyan">Installing {toolName}…</Text>;
  }

  return (
    <Text color="cyan">
      Forking {toolName} to tools/{toolName}
    </Text>
  );
}
