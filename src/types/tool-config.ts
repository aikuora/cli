import { z } from 'zod';

/**
 * Schemas for per-tool aikuora.config.yaml files
 */

export const moonTaskSchema = z.object({
  name: z.string(),
  command: z.string(),
});

export const linkVariantSchema = z.object({
  name: z.string(),
  default: z.boolean().optional(),
  forTools: z.array(z.string()).optional(),
});

export const linkConfigSchema = z.object({
  dependency: z.boolean(),
  targetFile: z.string(),
  content: z.string(),
  variants: z.array(linkVariantSchema).optional(),
  moonTask: moonTaskSchema.optional(),
});

export const scaffoldConfigSchema = z.object({
  type: z.enum(['app', 'package', 'module']),
  devtools: z.array(z.string()),
  moonTasks: z.array(moonTaskSchema),
});

export const toolConfigSchema = z.object({
  name: z.string(),
  customizable: z.boolean().default(false),
  lang: z.enum(['typescript', 'python']).optional(),
  runtime: z.enum(['node', 'python']).optional(),
  packageManager: z.enum(['pnpm', 'uv']).optional(),
  prototools: z.record(z.string()).default({}),
  /**
   * Maps scaffold tool names to integration handler file paths (relative to dependents/).
   * Used when a project declares this package as a dependency in aikuora.project.yml.
   * e.g. { nextjs: "nextjs.ts", expo: "expo.ts" }
   */
  dependents: z.record(z.string()).optional(),
  link: linkConfigSchema.optional(),
  scaffold: scaffoldConfigSchema.optional(),
});

/**
 * TypeScript types
 */
export type MoonTask = z.infer<typeof moonTaskSchema>;
export type LinkVariant = z.infer<typeof linkVariantSchema>;
export type LinkConfig = z.infer<typeof linkConfigSchema>;
export type ScaffoldConfig = z.infer<typeof scaffoldConfigSchema>;
export type ToolConfig = z.infer<typeof toolConfigSchema>;
