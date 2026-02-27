import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { addInheritedMoonTasks } from './moon.js';
import type { WorkspaceConfig } from '../types/tool-config.js';

// ---------------------------------------------------------------------------
// Private helper (module-internal)
// ---------------------------------------------------------------------------

function readJsonFile<T extends Record<string, unknown>>(p: string): T {
  if (!existsSync(p)) return {} as T;
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Workspace-level settings helpers
// ---------------------------------------------------------------------------

export async function mergeJsonFile(
  filePath: string,
  patch: Record<string, unknown>
): Promise<void> {
  const existing = readJsonFile<Record<string, unknown>>(filePath);
  const merged = { ...existing, ...patch };
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

export async function mergeClaudeHooks(
  filePath: string,
  hooks: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>
): Promise<void> {
  const existing = readJsonFile<Record<string, unknown>>(filePath);
  const existingHooks =
    (existing.hooks as Record<string, Array<{ matcher: string }>>) ?? {};

  for (const [event, newHooks] of Object.entries(hooks)) {
    const current = existingHooks[event] ?? [];
    for (const hook of newHooks) {
      if (!current.some((h) => h.matcher === hook.matcher)) {
        current.push(hook);
      }
    }
    existingHooks[event] = current;
  }

  const merged = { ...existing, hooks: existingHooks };
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

export async function mergeVscodeExtensions(
  filePath: string,
  extensions: string[]
): Promise<void> {
  const existing = readJsonFile<{ recommendations?: string[] }>(filePath);
  const current = existing.recommendations ?? [];
  for (const ext of extensions) {
    if (!current.includes(ext)) current.push(ext);
  }
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify({ ...existing, recommendations: current }, null, 2) + '\n',
    'utf-8'
  );
}

export async function mergeGitignore(
  filePath: string,
  patterns: string[],
  toolName?: string
): Promise<void> {
  let existing = '';
  if (existsSync(filePath)) {
    existing = readFileSync(filePath, 'utf-8');
  }

  const existingPatterns = new Set(
    existing
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  );

  const newPatterns = patterns.filter((p) => !existingPatterns.has(p));
  if (newPatterns.length === 0) return;

  const base = !existing || existing.endsWith('\n') ? existing : existing + '\n';
  const separator = base ? '\n' : '';
  const block =
    separator + (toolName ? `# ${toolName}\n` : '') + newPatterns.join('\n') + '\n';
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, base + block, 'utf-8');
}

export async function applyWorkspaceSettings(
  projectRoot: string,
  workspace: WorkspaceConfig,
  toolName?: string
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
  if (workspace.gitignore && workspace.gitignore.length > 0) {
    await mergeGitignore(join(projectRoot, '.gitignore'), workspace.gitignore, toolName);
  }
}
