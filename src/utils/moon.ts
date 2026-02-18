import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { parse, stringify } from 'yaml';

import type { MoonTask, WorkspaceConfig } from '../types/tool-config.js';

type MoonConfig = NonNullable<WorkspaceConfig['moon']>;

type MoonTaskEntry = {
  command: string;
  args?: string[];
  inputs?: string[];
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
    if (task.inputs && task.inputs.length > 0) entry.inputs = task.inputs;
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
  if (task.inputs && task.inputs.length > 0) entry.inputs = task.inputs;
  if (task.options) entry.options = task.options as Record<string, unknown>;

  config.tasks[task.name] = entry;

  await writeMoonYml(filePath, config);
}

const MOON_TASKS_SCHEMA = 'https://moonrepo.dev/schemas/v2/tasks.json';

/**
 * Insert a blank line before each task entry (except the first) for readability.
 * Input YAML must already be valid — this is a pure text post-processing step.
 */
function formatTasksYaml(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inTasksBlock = false;
  let isFirstTask = true;

  for (const line of lines) {
    if (/^tasks:/.test(line)) {
      inTasksBlock = true;
      isFirstTask = true;
      result.push(line);
      continue;
    }

    // A non-indented, non-empty line exits the tasks block
    if (inTasksBlock && line.length > 0 && !/^ /.test(line)) {
      inTasksBlock = false;
    }

    if (inTasksBlock && /^  [a-zA-Z0-9_-]+:/.test(line)) {
      if (!isFirstTask) result.push('');
      isFirstTask = false;
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Write tasks to `.moon/tasks/<inheritance.file>.yml` at the workspace root.
 * - Creates the file with `$schema` and `inheritedBy` if it does not exist.
 * - Preserves existing `inheritedBy` if the file already exists.
 * - Ensures `$schema` is always present (adds it to existing files if missing).
 * - Skips tasks that already exist in the file.
 * - Adds blank lines between task entries for readability.
 */
export async function addInheritedMoonTasks(
  workspaceRoot: string,
  inheritance: MoonConfig
): Promise<void> {
  const moonTasksDir = join(workspaceRoot, '.moon', 'tasks');
  const filePath = join(moonTasksDir, `${inheritance.file}.yml`);

  await mkdir(moonTasksDir, { recursive: true });

  type MoonTasksFile = {
    '$schema'?: string;
    inheritedBy?: Record<string, unknown>;
    tasks?: Record<string, MoonTaskEntry>;
  };

  let existing: MoonTasksFile = {};

  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, 'utf-8');
    existing = (parse(raw) as MoonTasksFile) ?? {};
  }

  // inheritedBy: preserve from existing file; set from config only when creating
  const inheritedBy =
    existing.inheritedBy ?? (inheritance.inheritedBy as Record<string, unknown> | undefined);

  // Merge tasks — skip any that already exist (idempotent)
  const tasks: Record<string, MoonTaskEntry> = existing.tasks ?? {};

  for (const task of inheritance.tasks) {
    if (tasks[task.name]) continue;
    const entry: MoonTaskEntry = { command: task.command };
    if (task.args && task.args.length > 0) entry.args = task.args;
    if (task.inputs && task.inputs.length > 0) entry.inputs = task.inputs;
    if (task.options) entry.options = task.options as Record<string, unknown>;
    tasks[task.name] = entry;
  }

  // Rebuild with stable key order: $schema → inheritedBy → tasks
  const finalConfig: MoonTasksFile = {
    '$schema': MOON_TASKS_SCHEMA,
    ...(inheritedBy ? { inheritedBy } : {}),
    tasks,
  };

  const raw = stringify(finalConfig, { lineWidth: 100, indent: 2 });
  await writeFile(filePath, formatTasksYaml(raw), 'utf-8');
}
