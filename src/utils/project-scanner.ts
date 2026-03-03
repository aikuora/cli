import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import type { Config } from '../types/config.js';
import type { ProjectFile } from '../types/project.js';
import { readProjectFile } from './project-file.js';

export type ScannedProject = {
  /** Relative path from the workspace root */
  path: string;
  /** Absolute path to the project directory */
  absPath: string;
  /** Parsed content of aikuora.project.yml */
  projectFile: ProjectFile;
};

/**
 * Walk each directory listed in `structure` (apps, packages, modules),
 * read immediate subdirectories, and return those that contain a valid
 * aikuora.project.yml.
 *
 * Subdirectories without a project file are silently skipped.
 * Works synchronously.
 */
export function scanProjects(
  workspaceRoot: string,
  structure: Config['structure']
): ScannedProject[] {
  const results: ScannedProject[] = [];

  const dirs: string[] = [];
  if (structure.apps) dirs.push(structure.apps);
  if (structure.packages) dirs.push(structure.packages);
  if (structure.modules) dirs.push(structure.modules);

  for (const dir of dirs) {
    const absDir = join(workspaceRoot, dir);
    let entries: string[];

    try {
      entries = readdirSync(absDir);
    } catch {
      // Directory does not exist or is not readable — skip silently
      continue;
    }

    for (const entry of entries) {
      const absPath = join(absDir, entry);

      let isDir: boolean;
      try {
        isDir = statSync(absPath).isDirectory();
      } catch {
        continue;
      }

      if (!isDir) continue;

      const projectFile = readProjectFile(absPath);
      if (!projectFile) continue;

      results.push({
        path: relative(workspaceRoot, absPath),
        absPath,
        projectFile,
      });
    }
  }

  return results;
}
