import { z } from 'zod';

/**
 * Zod schemas for root configuration file (aikuora.workspace.yml)
 */

export const structureConfigSchema = z.object({
  apps: z.string().default('apps'),
  packages: z.string().default('packages'),
  modules: z.string().default('modules'),
  tools: z.string().default('tools'),
});

export const defaultsConfigSchema = z.object({
  node: z.string().default('lts'),
  pnpm: z.string().default('latest'),
  python: z.string().default('3.12.x'),
  uv: z.string().default('latest'),
});

export const configSchema = z.object({
  name: z.string().min(1, 'Workspace name is required'),
  scope: z
    .string()
    .regex(/^@[a-z0-9-]+$/, 'Scope must match /^@[a-z0-9-]+$/'),
  structure: structureConfigSchema.default({
    apps: 'apps',
    packages: 'packages',
    modules: 'modules',
    tools: 'tools',
  }),
  defaults: defaultsConfigSchema.default({
    node: 'lts',
    pnpm: 'latest',
    python: '3.12.x',
    uv: 'latest',
  }),
  customTools: z.array(z.string()).default([]),
});

/**
 * TypeScript types inferred from zod schemas
 */
export type StructureConfig = z.infer<typeof structureConfigSchema>;
export type DefaultsConfig = z.infer<typeof defaultsConfigSchema>;
export type Config = z.infer<typeof configSchema>;
