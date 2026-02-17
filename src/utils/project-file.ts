import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';

import { stringify } from 'yaml';
import { parse } from 'yaml';

import { projectFileSchema, type ProjectFile } from '../types/project.js';

export const PROJECT_FILENAME = 'aikuora.project.yml';

/**
 * Read and validate a project's aikuora.project.yml.
 * Returns null if the file doesn't exist or is invalid.
 */
export function readProjectFile(dir: string): ProjectFile | null {
  const filePath = join(dir, PROJECT_FILENAME);

  if (!existsSync(filePath)) return null;

  try {
    const raw = parse(readFileSync(filePath, 'utf-8')) as unknown;
    const result = projectFileSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Write a project's aikuora.project.yml.
 */
export async function writeProjectFile(dir: string, data: ProjectFile): Promise<void> {
  const filePath = join(dir, PROJECT_FILENAME);
  await writeFile(filePath, stringify(data, { lineWidth: 100, indent: 2 }), 'utf-8');
}

/**
 * Append a tool name to dependencies.tools in the project file.
 * No-op if the file doesn't exist or the tool is already listed.
 */
export async function appendToolDependency(dir: string, tool: string): Promise<void> {
  const existing = readProjectFile(dir);
  if (!existing) return;

  if (existing.dependencies.tools.includes(tool)) return;

  existing.dependencies.tools.push(tool);
  await writeProjectFile(dir, existing);
}

/**
 * Append a project path to dependencies.projects in the project file.
 * No-op if the file doesn't exist or the path is already listed.
 */
export async function appendProjectDependency(dir: string, projectPath: string): Promise<void> {
  const existing = readProjectFile(dir);
  if (!existing) return;

  if (existing.dependencies.projects.includes(projectPath)) return;

  existing.dependencies.projects.push(projectPath);
  await writeProjectFile(dir, existing);
}
