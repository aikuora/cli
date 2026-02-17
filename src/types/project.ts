import { z } from 'zod';

/**
 * Schemas for per-project aikuora.project.yml files.
 * Each app, package, and module in the monorepo has one of these.
 *
 * Written by the CLI when a project is scaffolded or when dependencies change.
 * Can also be edited manually by the user.
 */

export const projectDependenciesSchema = z.object({
  /**
   * Tool configs linked to this project (e.g. prettier, eslint).
   * Managed by `aikuora add <tool> <target>`.
   */
  tools: z.array(z.string()).default([]),
  /**
   * Workspace packages this project consumes (e.g. packages/ui).
   * Managed by `aikuora add <package> <target>`.
   * Adding an entry triggers the package's integration handler for this project.
   */
  projects: z.array(z.string()).default([]),
});

export const projectFileSchema = z.object({
  /** The scaffold tool used to create this project (e.g. "nextjs", "expo", "ts-library") */
  tool: z.string(),
  type: z.enum(['app', 'package', 'module']),
  dependencies: projectDependenciesSchema.default({ tools: [], projects: [] }),
});

/**
 * TypeScript types
 */
export type ProjectDependencies = z.infer<typeof projectDependenciesSchema>;
export type ProjectFile = z.infer<typeof projectFileSchema>;
