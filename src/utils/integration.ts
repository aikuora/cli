import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';

import Handlebars from 'handlebars';

import { loadToolConfig } from '../core/loader.js';
import { resolveTool } from '../core/resolver.js';
import type { IntegrationContext, IntegrationHandler } from '../types/integration.js';
import type { FilePatch, PatchOp } from '../types/tool-config.js';
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
 * Supports two handler styles:
 *  - string  → loads a compiled JS file from `dependents/<name>.js` and calls `integrate(ctx)`
 *  - object  → applies declarative file patches via the built-in patch engine
 *
 * Returns true if a handler was found and executed, false otherwise.
 */
export async function invokeIntegrationHandler(options: InvokeOptions): Promise<boolean> {
  const { sourceDir, targetDir, sourceName, scopedName, tools, workspaceRoot, scope } = options;

  const sourceProject = readProjectFile(sourceDir);
  const targetProject = readProjectFile(targetDir);

  if (!sourceProject || !targetProject) return false;

  const sourceTool = resolveTool(sourceProject.tool, tools);
  if (!sourceTool) return false;

  const toolConfigResult = loadToolConfig(sourceTool.path);
  if (!toolConfigResult.success || !toolConfigResult.data?.dependents) return false;

  const handlerEntry = toolConfigResult.data.dependents[targetProject.tool];
  if (!handlerEntry) return false;

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

  if (typeof handlerEntry === 'string') {
    // JS handler — escape hatch for logic that can't be expressed declaratively
    const base = handlerEntry.replace(/\.(ts|js)$/, '');
    const handlerPath = join(sourceTool.path, 'dependents', `${base}.js`);
    if (!existsSync(handlerPath)) return false;

    const mod = (await import(handlerPath)) as { integrate?: IntegrationHandler };
    if (typeof mod.integrate !== 'function') {
      throw new Error(
        `Integration handler at '${handlerPath}' does not export an 'integrate' function`
      );
    }
    await mod.integrate(ctx);
  } else {
    // Declarative patch engine
    await applyDeclarativePatches(handlerEntry.patches, ctx);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Declarative patch engine
// ---------------------------------------------------------------------------

async function applyDeclarativePatches(patches: FilePatch[], ctx: IntegrationContext): Promise<void> {
  for (const filePatch of patches) {
    const filePath = join(ctx.target.path, filePatch.file);
    if (!existsSync(filePath)) continue;

    // Idempotency: skip this file entirely if the guard string is already present
    if (filePatch.idempotentIf) {
      const content = readFileSync(filePath, 'utf-8');
      if (content.includes(filePatch.idempotentIf)) continue;
    }

    for (const op of filePatch.ops) {
      await applyPatchOp(filePath, op, ctx);
    }

    if (filePatch.format) {
      runPrettier(filePath, ctx.target.path);
    }
  }
}

async function applyPatchOp(filePath: string, op: PatchOp, ctx: IntegrationContext): Promise<void> {
  const hbsVars = ctx.source;

  switch (op.type) {
    case 'insertAfter': {
      // Escape the `after` string so it's treated as a literal match inside RegExp
      const escaped = op.after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped);
      const rendered = Handlebars.compile(op.content)(hbsVars);
      await ctx.fs.insertAfterLine(filePath, pattern, rendered);
      break;
    }
    case 'replace': {
      const content = readFileSync(filePath, 'utf-8');
      const to = Handlebars.compile(op.to)(hbsVars);
      await writeFile(filePath, content.replaceAll(op.from, to), 'utf-8');
      break;
    }
    case 'wrapJsx': {
      const content = readFileSync(filePath, 'utf-8');
      const propsStr = renderJsxProps(op.props ?? {});
      // Indentation is intentionally ignored here — the `format` step handles it
      const wrapped = `<${op.component}${propsStr}>${op.target}</${op.component}>`;
      await writeFile(filePath, content.replaceAll(op.target, wrapped), 'utf-8');
      break;
    }
  }
}

function renderJsxProps(props: Record<string, string | boolean>): string {
  return Object.entries(props)
    .map(([key, value]) => {
      if (value === true) return ` ${key}`;
      if (value === false) return ` ${key}={false}`;
      return ` ${key}="${value}"`;
    })
    .join('');
}

/**
 * Run prettier on a file. Silently no-ops if prettier is not available
 * (e.g. before `pnpm install` has been run). The file content is still
 * semantically correct even without formatting.
 */
function runPrettier(filePath: string, cwd: string): void {
  try {
    execSync(`pnpm exec prettier --write "${filePath}"`, { cwd, stdio: 'ignore' });
  } catch {
    // prettier not available yet — user can run format manually
  }
}
