import { z } from 'zod';

/**
 * Schemas for per-tool aikuora.config.yaml files
 */

export const toolMetadataSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  authors: z.array(z.string()).default([]),
  version: z.string().optional(),
});

export const linkableConfigSchema = z.object({
  variants: z.record(z.string()).default({}),
  instructions: z.string().optional(),
});

export const scaffoldableConfigSchema = z.object({
  variables: z.record(z.any()).default({}),
  postScaffold: z.string().optional(),
});

export const toolConfigSchema = z.object({
  metadata: toolMetadataSchema,
  linkable: linkableConfigSchema.optional(),
  scaffoldable: scaffoldableConfigSchema.optional(),
});

/**
 * TypeScript types
 */
export type ToolMetadata = z.infer<typeof toolMetadataSchema>;
export type LinkableConfig = z.infer<typeof linkableConfigSchema>;
export type ScaffoldableConfig = z.infer<typeof scaffoldableConfigSchema>;
export type ToolConfig = z.infer<typeof toolConfigSchema>;
