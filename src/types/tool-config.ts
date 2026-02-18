import { z } from 'zod';

/**
 * Schemas for per-tool aikuora.tool.yml files
 */

export const moonTaskOptionsSchema = z.object({
  cache: z.boolean().optional(),
});

export const moonTaskSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  options: moonTaskOptionsSchema.optional(),
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
  moonTasks: z.array(moonTaskSchema).optional(),
});

export const scaffoldConfigSchema = z.object({
  type: z.enum(['app', 'package', 'module']),
  devtools: z.array(z.string()),
  moonTasks: z.array(moonTaskSchema),
});

export const claudeHookEntrySchema = z.object({
  matcher: z.string(),
  command: z.string(),
});

export const workspaceConfigSchema = z.object({
  /**
   * VSCode workspace integrations applied at the monorepo root.
   * `settings` merges into `.vscode/settings.json`.
   * `extensions` appends to `.vscode/extensions.json` recommendations.
   */
  vscode: z
    .object({
      settings: z.record(z.unknown()).optional(),
      extensions: z.array(z.string()).optional(),
    })
    .optional(),
  /**
   * Hooks to add to `.claude/settings.json` at the workspace root.
   * e.g. `{ PostFileWrite: [{ matcher: "*.ts", command: "..." }] }`
   */
  claude: z
    .object({
      hooks: z.record(z.array(claudeHookEntrySchema)),
    })
    .optional(),
  /**
   * Moon task inheritance config.
   * Tasks are written to `.moon/tasks/<file>.yml` and inherited by matching projects.
   * `inheritedBy` is only written when creating the file; existing value is preserved.
   */
  moon: z
    .object({
      /** Target filename without extension, e.g. "typescript" → `.moon/tasks/typescript.yml` */
      file: z.string(),
      /**
       * Conditions that must be met for projects to inherit these tasks.
       * Maps directly to Moon's `inheritedBy` field (toolchains, stacks, layers, tags…).
       */
      inheritedBy: z.record(z.unknown()).optional(),
      tasks: z.array(moonTaskSchema),
    })
    .optional(),
});

export const toolConfigSchema = z.object({
  name: z.string(),
  /**
   * Determines how the tool is deployed in the workspace:
   * - `shareable` — creates a shared package in `packages/tools/<name>` that dependents import from
   * - `root`      — creates a single config at the workspace root
   * - `none`      — default; scaffold/link behavior only
   */
  kind: z.enum(['shareable', 'root', 'none']).default('none'),
  customizable: z.boolean().default(false),
  lang: z.enum(['typescript', 'python']).optional(),
  runtime: z.enum(['node', 'python']).optional(),
  packageManager: z.enum(['pnpm', 'uv']).optional(),
  prototools: z.record(z.string()).default({}),
  /**
   * Maps scaffold tool names to integration handler file paths (relative to dependents/).
   * Used when a project declares this package as a dependency in aikuora.project.yml.
   * e.g. `{ nextjs: "nextjs.ts", expo: "expo.ts" }`
   */
  dependents: z.record(z.string()).optional(),
  /**
   * Workspace-level integrations applied when this tool is installed.
   * Covers VSCode settings/extensions, Claude Code hooks, and Moon task inheritance.
   */
  workspace: workspaceConfigSchema.optional(),
  link: linkConfigSchema.optional(),
  scaffold: scaffoldConfigSchema.optional(),
});

/**
 * TypeScript types
 */
export type MoonTaskOptions = z.infer<typeof moonTaskOptionsSchema>;
export type MoonTask = z.infer<typeof moonTaskSchema>;
export type LinkVariant = z.infer<typeof linkVariantSchema>;
export type LinkConfig = z.infer<typeof linkConfigSchema>;
export type ScaffoldConfig = z.infer<typeof scaffoldConfigSchema>;
export type ClaudeHookEntry = z.infer<typeof claudeHookEntrySchema>;
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
export type ToolConfig = z.infer<typeof toolConfigSchema>;
