import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';

import { parse, stringify } from 'yaml';

import type { MoonTask } from '../types/tool-config.js';

/**
 * Build a moon.yml data structure from a list of tasks.
 */
export function buildMoonConfig(tasks: MoonTask[]): object {
  const taskEntries: Record<string, { command: string }> = {};

  for (const task of tasks) {
    taskEntries[task.name] = { command: task.command };
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
  let config: { tasks?: Record<string, { command: string }> } = {};

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

  config.tasks[task.name] = { command: task.command };

  await writeMoonYml(filePath, config);
}
