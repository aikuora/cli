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
  /** Files/globs that trigger this task when changed (Moon's `inputs` field). */
  inputs: z.array(z.string()).optional(),
  options: moonTaskOptionsSchema.optional(),
});

export const linkVariantSchema = z.object({
  name: z.string(),
  default: z.boolean().optional(),
  forTools: z.array(z.string()).optional(),
  /** Optional content override for this variant. Replaces link.content when selected. */
  content: z.string().optional(),
});

export const linkConfigSchema = z.object({
  dependency: z.boolean(),
  targetFile: z.string(),
  content: z.string(),
  variants: z.array(linkVariantSchema).optional(),
  moonTasks: z.array(moonTaskSchema).optional(),
});

export const devtoolEntrySchema = z.union([
  z.string(),
  z.object({ tool: z.string(), variant: z.string() }),
]);

export const scaffoldConfigSchema = z.object({
  type: z.enum(['app', 'package', 'module']),
  devtools: z.array(devtoolEntrySchema),
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
   * Tasks are written to `.moon/tasks/<file>.yml`.
   * Moon automatically inherits tasks from `.moon/tasks/<language>.yml` for matching projects.
   */
  moon: z
    .object({
      /** Target filename without extension, e.g. "typescript" → `.moon/tasks/typescript.yml` */
      file: z.string(),
      tasks: z.array(moonTaskSchema),
    })
    .optional(),
  /**
   * Patterns to append to the root `.gitignore`.
   * Only patterns not already present are added (idempotent).
   */
  gitignore: z.array(z.string()).optional(),
});

export const toolConfigSchema = z.object({
  name: z.string(),
  /**
   * Determines how the tool is deployed in the workspace:
   * - `shareable` — creates a shared package in `packages/configs/` that dependents import from
   * - `root`      — creates workspace-level config files (pnpm-workspace.yaml, toolchain.yml, etc.)
   * - `none`      — default; scaffold/link behavior only
   */
  kind: z.enum(['shareable', 'root', 'none']).default('none'),
  /**
   * How the tool binary is installed. Only used for `kind: root` tools.
   * `proto` — managed by proto; pins the version in `.prototools`.
   */
  installer: z.enum(['proto']).optional(),
  /**
   * Default version for this tool (fallback when workspace `defaults` doesn't specify it).
   * Used with `installer: proto` to pin the version in `.prototools`.
   */
  version: z.string().optional(),
  /**
   * Other aikuora tools that must be set up before this one.
   * e.g. `requires: [pnpm]` ensures pnpm workspace is configured before adding shared packages.
   */
  requires: z.array(z.string()).optional(),
  customizable: z.boolean().default(false),
  lang: z.enum(['typescript', 'python']).optional(),
  runtime: z.enum(['node', 'python']).optional(),
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
export type DevtoolEntry = z.infer<typeof devtoolEntrySchema>;
export type ScaffoldConfig = z.infer<typeof scaffoldConfigSchema>;
export type ClaudeHookEntry = z.infer<typeof claudeHookEntrySchema>;
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
export type ToolConfig = z.infer<typeof toolConfigSchema>;
