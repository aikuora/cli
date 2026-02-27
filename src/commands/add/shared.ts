import { loadToolConfig } from '../../core/loader.js';
import { resolveTool } from '../../core/resolver.js';
import { scanAllTools } from '../../core/scanner.js';
import type { DiscoveredTool } from '../../types/tool.js';
import { output, outputError } from '../../utils/output.js';

/**
 * Resolve a tool by name and load its config in one step.
 * Returns `{ success: false }` (after emitting the appropriate error) when
 * the tool cannot be found or its config cannot be loaded.
 */
export async function loadResolvedTool(
  toolName: string,
  projectRoot: string,
  customPaths: string[],
  json: boolean | undefined,
  mode: string,
  silent?: boolean
): Promise<
  | { success: false }
  | {
      success: true;
      discovered: DiscoveredTool;
      toolConfig: NonNullable<ReturnType<typeof loadToolConfig>['data']>;
      tools: ReturnType<typeof scanAllTools>;
    }
> {
  const tools = scanAllTools(projectRoot, customPaths);
  const discovered = resolveTool(toolName, tools);

  if (!discovered) {
    const err = `Tool '${toolName}' not found`;
    if (!silent) {
      if (json) output({ action: 'add', mode, success: false, error: err }, { json: json ?? false });
      else outputError(err, { json: json ?? false });
    }
    return { success: false };
  }

  const loaderResult = loadToolConfig(discovered.path);
  if (!loaderResult.success) {
    const err = loaderResult.error?.message ?? 'Could not load tool config';
    if (!silent) {
      if (json) output({ action: 'add', mode, success: false, error: err }, { json: json ?? false });
      else outputError(err, { json: json ?? false });
    }
    return { success: false };
  }

  return { success: true, discovered, toolConfig: loaderResult.data!, tools };
}
