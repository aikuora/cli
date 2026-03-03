import { resolve } from 'path';

import { loadToolConfig } from '../core/loader.js';
import { scanAllTools } from '../core/scanner.js';
import type { OutputOptions } from '../utils/output.js';
import { output, outputError, outputInfo } from '../utils/output.js';
import { scanProjects } from '../utils/project-scanner.js';
import { validateWorkspace } from '../utils/workspace.js';

const VALID_TYPES = ['tools', 'apps', 'packages', 'modules'] as const;
type ListType = (typeof VALID_TYPES)[number];

export interface ListOptions extends OutputOptions {
  type: string;
  cwd?: string;
}

export async function listCommand(options: ListOptions): Promise<{ success: boolean }> {
  const { json, cwd, type } = options;
  const projectRoot = resolve(cwd ?? process.cwd());

  // STARTUP-001: validate workspace before running command logic
  const wsResult = validateWorkspace(projectRoot);
  if (!wsResult.valid) {
    if (json) output({ action: 'list', success: false, error: wsResult.error }, { json });
    else outputError(wsResult.error, { json });
    return { success: false };
  }

  // Validate the type argument
  if (!VALID_TYPES.includes(type as ListType)) {
    const err = 'Valid types are: tools, apps, packages, modules';
    if (json) output({ action: 'list', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  const config = wsResult.config;
  const validType = type as ListType;
  let items: unknown[];

  if (validType === 'tools') {
    const toolMap = scanAllTools(projectRoot, config.customTools);
    items = Object.values(toolMap).map((t) => {
      const configResult = loadToolConfig(t.path);
      const cfg = configResult.success ? configResult.data : undefined;
      return {
        name: t.name,
        source: t.source,
        kind: cfg?.kind ?? '—',
        lang: cfg?.lang ?? '—',
        description: cfg?.description ?? '',
      };
    });
  } else {
    const allProjects = scanProjects(projectRoot, config.structure);

    if (validType === 'apps') {
      items = allProjects
        .filter((p) => p.projectFile.kind === 'app')
        .map((p) => ({ path: p.path, kind: p.projectFile.kind }));
    } else if (validType === 'packages') {
      // Packages includes both kind=package and kind=shareable
      items = allProjects
        .filter((p) => p.projectFile.kind === 'package' || p.projectFile.kind === 'shareable')
        .map((p) => ({ path: p.path, kind: p.projectFile.kind }));
    } else {
      // modules
      items = allProjects
        .filter((p) => p.projectFile.kind === 'module')
        .map((p) => ({ path: p.path, kind: p.projectFile.kind }));
    }
  }

  if (json) {
    output({ action: 'list', success: true, type: validType, items }, { json });
  } else {
    if (items.length === 0) {
      outputInfo(`No ${validType} found.`, { json });
    } else if (validType === 'tools') {
      const rows = items as Array<{
        name: string;
        source: string;
        kind: string;
        lang: string;
        description: string;
      }>;
      const c = {
        reset: '\x1b[0m',
        bold: '\x1b[1m',
        dim: '\x1b[2m',
        cyan: '\x1b[36m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        gray: '\x1b[90m',
      };
      const colorSource = (s: string) =>
        s === 'built-in'
          ? `${c.cyan}${s}${c.reset}`
          : s === 'custom'
            ? `${c.magenta}${s}${c.reset}`
            : `${c.blue}${s}${c.reset}`;
      const colorKind = (k: string) =>
        k === 'shareable'
          ? `${c.green}${k}${c.reset}`
          : k === 'root'
            ? `${c.yellow}${k}${c.reset}`
            : `${c.dim}${k}${c.reset}`;
      const colorLang = (l: string) =>
        l === 'typescript'
          ? `${c.blue}${l}${c.reset}`
          : l === 'python'
            ? `${c.yellow}${l}${c.reset}`
            : `${c.dim}${l}${c.reset}`;

      const nameW = Math.max(...rows.map((r) => r.name.length));
      const sourceW = Math.max(...rows.map((r) => r.source.length));
      const kindW = Math.max(...rows.map((r) => r.kind.length));
      const langW = Math.max(...rows.map((r) => r.lang.length));
      const lines = rows.map((r) => {
        const name = `${c.bold}${r.name.padEnd(nameW)}${c.reset}`;
        const source = colorSource(r.source.padEnd(sourceW));
        const kind = colorKind(r.kind.padEnd(kindW));
        const lang = colorLang(r.lang.padEnd(langW));
        const desc = r.description ? `  ${c.gray}${r.description}${c.reset}` : '';
        return `${name}  ${source}  ${kind}  ${lang}${desc}`;
      });
      outputInfo(lines.join('\n'), { json });
    } else {
      outputInfo(
        (items as Array<{ path: string; kind: string }>)
          .map((i) => `${i.path} [${i.kind}]`)
          .join('\n'),
        { json }
      );
    }
  }

  return { success: true };
}

