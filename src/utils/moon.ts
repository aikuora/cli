import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { parse, stringify } from 'yaml';

import type { MoonTask, WorkspaceConfig } from '../types/tool-config.js';

type MoonConfig = NonNullable<WorkspaceConfig['moon']>;

type MoonTaskEntry = {
  command: string;
  args?: string[];
  options?: Record<string, unknown>;
};

/**
 * Build a moon.yml data structure from a list of tasks.
 */
export function buildMoonConfig(tasks: MoonTask[]): object {
  const taskEntries: Record<string, MoonTaskEntry> = {};

  for (const task of tasks) {
    const entry: MoonTaskEntry = { command: task.command };
    if (task.args && task.args.length > 0) entry.args = task.args;
    if (task.options) entry.options = task.options as Record<string, unknown>;
    taskEntries[task.name] = entry;
  }

  return { tasks: taskEntries };
}

/**
 * Write a moon.yml file at the given path.
 */
export async function writeMoonYml(filePath: string, config: object): Promise<void> {
  const content = stringify(config, { lineWidth: 100, indent: 2 });
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Add a task to an existing moon.yml, or create the file if it doesn't exist.
 * Skips the task if it already exists.
 */
export async function addMoonTask(filePath: string, task: MoonTask): Promise<void> {
  let config: { tasks?: Record<string, MoonTaskEntry> } = {};

  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, 'utf-8');
    config = (parse(raw) as typeof config) ?? {};
  }

  if (!config.tasks) {
    config.tasks = {};
  }

  // Skip if task already exists
  if (config.tasks[task.name]) {
    return;
  }

  const entry: MoonTaskEntry = { command: task.command };
  if (task.args && task.args.length > 0) entry.args = task.args;
  if (task.options) entry.options = task.options as Record<string, unknown>;

  config.tasks[task.name] = entry;

  await writeMoonYml(filePath, config);
}

/**
 * Write tasks to `.moon/tasks/<inheritance.file>.yml` at the workspace root.
 * - Creates the file with `inheritedBy` if it does not exist.
 * - Preserves existing `inheritedBy` if the file already exists.
 * - Skips tasks that already exist in the file.
 */
export async function addInheritedMoonTasks(
  workspaceRoot: string,
  inheritance: MoonConfig
): Promise<void> {
  const moonTasksDir = join(workspaceRoot, '.moon', 'tasks');
  const filePath = join(moonTasksDir, `${inheritance.file}.yml`);

  await mkdir(moonTasksDir, { recursive: true });

  type MoonTasksFile = {
    inheritedBy?: Record<string, unknown>;
    tasks?: Record<string, MoonTaskEntry>;
  };

  let config: MoonTasksFile = {};

  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, 'utf-8');
    config = (parse(raw) as MoonTasksFile) ?? {};
  } else if (inheritance.inheritedBy) {
    // Only set inheritedBy when creating the file for the first time
    config.inheritedBy = inheritance.inheritedBy as Record<string, unknown>;
  }

  if (!config.tasks) {
    config.tasks = {};
  }

  for (const task of inheritance.tasks) {
    if (config.tasks[task.name]) continue;
    const entry: MoonTaskEntry = { command: task.command };
    if (task.args && task.args.length > 0) entry.args = task.args;
    if (task.options) entry.options = task.options as Record<string, unknown>;
    config.tasks[task.name] = entry;
  }

  await writeMoonYml(filePath, config);
}
