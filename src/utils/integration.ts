import { existsSync } from 'fs';
import { join } from 'path';

import { loadToolConfig } from '../core/loader.js';
import { resolveTool } from '../core/resolver.js';
import type { IntegrationContext, IntegrationHandler } from '../types/integration.js';
import type { ToolMap } from '../types/tool.js';
import { createIntegrationFs } from './integration-fs.js';
import { readProjectFile } from './project-file.js';

interface InvokeOptions {
  /** Absolute path to the package being added as a dependency (e.g. /root/packages/ui) */
  sourceDir: string;
  /** Absolute path to the project consuming the package (e.g. /root/apps/dashboard) */
  targetDir: string;
  /** Workspace-relative path of the source (e.g. "packages/ui") */
  sourceName: string;
  /** Scoped package name (e.g. "\@scope/ui") */
  scopedName: string;
  tools: ToolMap;
  workspaceRoot: string;
  scope?: string;
}

/**
 * Resolve and invoke the integration handler for a project dependency.
 *
 * Flow:
 * 1. Read aikuora.project.yml from source and target to get their scaffold tools
 * 2. Look up the source tool's aikuora.tool.yml → read dependents[target.tool]
 * 3. Import the handler JS file and call integrate(ctx)
 *
 * Returns true if a handler was found and executed, false otherwise.
 * Failures in handler execution are surfaced as thrown errors.
 */
export async function invokeIntegrationHandler(options: InvokeOptions): Promise<boolean> {
  const { sourceDir, targetDir, sourceName, scopedName, tools, workspaceRoot, scope } = options;

  const sourceProject = readProjectFile(sourceDir);
  const targetProject = readProjectFile(targetDir);

  if (!sourceProject || !targetProject) return false;

  // Find the tool that scaffolded the source package
  const sourceTool = resolveTool(sourceProject.tool, tools);
  if (!sourceTool) return false;

  const toolConfigResult = loadToolConfig(sourceTool.path);
  if (!toolConfigResult.success || !toolConfigResult.data?.dependents) return false;

  const handlerEntry = toolConfigResult.data.dependents[targetProject.tool];
  if (!handlerEntry) return false;

  // Strip extension and try .js (handlers are compiled from .ts by tsup in Phase 3)
  const base = handlerEntry.replace(/\.(ts|js)$/, '');
  const handlerPath = join(sourceTool.path, 'dependents', `${base}.js`);

  if (!existsSync(handlerPath)) return false;

  const mod = (await import(handlerPath)) as { integrate?: IntegrationHandler };

  if (typeof mod.integrate !== 'function') {
    throw new Error(
      `Integration handler at '${handlerPath}' does not export an 'integrate' function`
    );
  }

  const ctx: IntegrationContext = {
    target: {
      path: targetDir,
      tool: targetProject.tool,
      type: targetProject.type,
      scope,
    },
    source: {
      path: sourceDir,
      name: sourceName,
      scopedName,
    },
    workspace: {
      root: workspaceRoot,
      scope,
    },
    fs: createIntegrationFs(),
  };

  await mod.integrate(ctx);
  return true;
}
