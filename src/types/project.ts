import { z } from 'zod';

/**
 * Schemas for per-project aikuora.project.yml files.
 * Each app, package, module, and shareable in the monorepo has one of these.
 *
 * Written by the CLI when a project is scaffolded or when dependencies change.
 * Can also be edited manually by the user.
 */

export const projectFileSchema = z.object({
  /** Project kind — matches the scaffold type or 'shareable' for configs packages */
  kind: z.enum(['app', 'package', 'module', 'shareable']),
  /** Human-readable project name (e.g. "dashboard", "ui") */
  name: z.string().optional(),
  /** The scaffold tool used to create this project (e.g. "nextjs", "expo", "ts-library") */
  scaffold_tool: z.string().optional(),
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
  dependencies: z.array(z.string()).default([]),
});

/**
 * TypeScript type inferred from the Zod schema
 */
export type ProjectFile = z.infer<typeof projectFileSchema>;
