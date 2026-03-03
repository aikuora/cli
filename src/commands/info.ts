import { join, resolve } from 'path';

import type { OutputOptions } from '../utils/output.js';
import { output, outputError, outputSuccess } from '../utils/output.js';
import { readPrototools } from '../utils/prototools.js';
import { scanProjects } from '../utils/project-scanner.js';
import { validateWorkspace } from '../utils/workspace.js';

export interface InfoOptions extends OutputOptions {
  cwd?: string;
}

export async function infoCommand(options: InfoOptions): Promise<{ success: boolean }> {
  const { json, cwd } = options;
  const projectRoot = resolve(cwd ?? process.cwd());

  // STARTUP-001: validate workspace before running command logic
  const wsResult = validateWorkspace(projectRoot);
  if (!wsResult.valid) {
    if (json) output({ action: 'info', success: false, error: wsResult.error }, { json });
    else outputError(wsResult.error, { json });
    return { success: false };
  }

  const config = wsResult.config;

  // Discover all projects (apps, packages, modules) that have an aikuora.project.yml
  const scanned = scanProjects(projectRoot, config.structure);

  const projects = scanned.map((p) => ({
    path: p.path,
    kind: p.projectFile.kind,
    tools: p.projectFile.tools,
  }));

  // Read runtime pins from .prototools — omit section if file is absent
  const prototoolsPath = join(projectRoot, '.prototools');
  const rawPins = readPrototools(prototoolsPath);
  const runtimePins = Object.keys(rawPins).length > 0 ? rawPins : undefined;

  const result: Record<string, unknown> = {
    action: 'info',
    success: true,
    workspace: { name: config.name, scope: config.scope },
    projects,
  };

  if (runtimePins) {
    result.runtimePins = runtimePins;
  }

  if (json) {
    output(result, { json });
  } else {
    outputSuccess(
      `Workspace: ${config.name} (${config.scope})\n` +
        `Projects (${projects.length}):\n` +
        projects
          .map(
            (p) =>
              `  ${p.path} [${p.kind}]${p.tools.length > 0 ? ' — tools: ' + p.tools.join(', ') : ''}`
          )
          .join('\n') +
        (runtimePins
          ? '\nRuntime pins:\n' +
            Object.entries(runtimePins)
              .map(([k, v]) => `  ${k} = "${v}"`)
              .join('\n')
          : ''),
      { json }
    );
  }

  return { success: true };
}

