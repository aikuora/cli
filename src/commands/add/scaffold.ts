import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, resolve } from 'path';

import fse from 'fs-extra';

import { loadToolConfig } from '../../core/loader.js';
import { resolveTool } from '../../core/resolver.js';
import { scanAllTools } from '../../core/scanner.js';
import { readConfig } from '../../managers/config.js';
import type { Config } from '../../types/config.js';
import type { MoonTask } from '../../types/tool-config.js';
import { invokeIntegrationHandler } from '../../utils/integration.js';
import { injectCssImport, patchTsconfigPaths, patchTsconfigReferences, sortDeps } from '../../utils/integration-patches.js';
import { buildMoonConfig, writeMoonYml } from '../../utils/moon.js';
import { output, outputError, outputSuccess } from '../../utils/output.js';
import { writeProjectFile } from '../../utils/project-file.js';
import { updatePrototools } from '../../utils/prototools.js';
import { renderAndCopy } from '../../utils/template.js';
import { applyWorkspaceSettings } from '../../utils/workspace-integrations.js';
import type { AddOptions } from '../add.js';
import { runLink } from './link.js';
import { loadResolvedTool } from './shared.js';

// ---------------------------------------------------------------------------
// Private helper (module-internal)
// ---------------------------------------------------------------------------

function readJsonFile<T extends Record<string, unknown>>(p: string): T {
  if (!existsSync(p)) return {} as T;
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Workspace package helper (used by scaffold.packages)
// ---------------------------------------------------------------------------

/**
 * Ensure a workspace package exists for the given scaffold tool.
 * If the package directory does not exist yet, scaffolds it first.
 * Returns the scoped package name to add as a workspace dependency.
 */
export async function ensureWorkspacePackage(
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
  const scope = rootConfig.scope;
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

export async function runScaffold(options: AddOptions) {
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

  const scope = rootConfig.scope;
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

  try {
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
      kind: scaffold.type,
      name: appName,
      scaffold_tool: toolName,
      tools: linkedTools,
      dependencies: packagedTools,
    });

    // Invoke integration handlers for each wired workspace package.
    // Both aikuora.project.yml files now exist so invokeIntegrationHandler can resolve them.
    for (const pkgToolName of packagedTools) {
      const pkgAbsPath = join(projectRoot, rootConfig.structure.packages, pkgToolName);
      const pkgRelPath = `${rootConfig.structure.packages}/${pkgToolName}`;
      const pkgScopedName = rootConfig.scope
        ? `${rootConfig.scope}/${pkgToolName}`
        : pkgToolName;
      await invokeIntegrationHandler({
        sourceDir: pkgAbsPath,
        targetDir,
        sourceName: pkgRelPath,
        scopedName: pkgScopedName,
        tools: resolved.tools,
        workspaceRoot: projectRoot,
        scope: rootConfig.scope,
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
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    if (existsSync(targetDir)) {
      try {
        await fse.remove(targetDir);
        if (json) output({ action: 'add', mode: 'scaffold', success: false, error }, { json });
        else outputError(error, { json });
      } catch (cleanupCaught) {
        const cleanupError = cleanupCaught instanceof Error ? cleanupCaught.message : String(cleanupCaught);
        if (json) {
          output({ action: 'add', mode: 'scaffold', success: false, error, cleanupError, manualCleanupRequired: true, partialPath: targetDir }, { json });
        } else {
          outputError(error, { json });
          outputError(`Cleanup failed: ${cleanupError}. Please delete ${targetDir} manually.`, { json });
        }
      }
    } else {
      if (json) output({ action: 'add', mode: 'scaffold', success: false, error }, { json });
      else outputError(error, { json });
    }
    return { success: false };
  }
}
