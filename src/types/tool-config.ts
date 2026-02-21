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
  /** Files/dirs produced by this task (Moon's `outputs` field, enables caching). */
  outputs: z.array(z.string()).optional(),
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
  /**
   * Scaffold tools that create standalone workspace packages (e.g. packages/ui).
   * For each entry the CLI will:
   *   1. Scaffold the package if it does not already exist.
   *   2. Add it as a `workspace:*` dependency to the current scaffold target.
   * Unlike devtools (which run in link mode), these are full scaffold operations.
   */
  packages: z.array(z.string()).optional(),
  /**
   * Moon project tags written to moon.yml.
   * Projects tagged with a name inherit tasks from `.moon/tasks/<name>.yml`.
   * e.g. `tags: [shadcn]` → inherits `.moon/tasks/shadcn.yml`
   */
  tags: z.array(z.string()).optional(),
  /**
   * Relative path (from the scaffold root) to the main CSS entry file.
   * When workspace packages are wired in, their CSS exports are injected here.
   * e.g. `cssEntry: src/app/globals.css` for a Next.js app.
   */
  cssEntry: z.string().optional(),
  moonTasks: z.array(moonTaskSchema),
});

export const claudeHookCommandSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
  timeout: z.number().optional(),
});

export const claudeHookEntrySchema = z.object({
  /** Matches the Claude tool name, e.g. "Write|Edit" */
  matcher: z.string(),
  hooks: z.array(claudeHookCommandSchema),
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
      /**
       * Named file groups to merge into `.moon/tasks/<file>.yml`.
       * Each key is a group name; the value is a list of globs/paths.
       * Groups from multiple tools are merged (patterns deduplicated).
       */
      fileGroups: z.record(z.array(z.string())).optional(),
      tasks: z.array(moonTaskSchema),
    })
    .optional(),
  /**
   * Patterns to append to the root `.gitignore`.
   * Only patterns not already present are added (idempotent).
   */
  gitignore: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Declarative integration patches (used in dependents map)
// ---------------------------------------------------------------------------

export const insertAfterOpSchema = z.object({
  type: z.literal('insertAfter'),
  /** Find the first line that contains this string and insert content after it. */
  after: z.string(),
  /** Line to insert. Handlebars template — receives source context vars (scopedName, name, path). */
  content: z.string(),
});

export const replaceOpSchema = z.object({
  type: z.literal('replace'),
  /** Literal string to find in the file. */
  from: z.string(),
  /** Replacement string. Handlebars template. */
  to: z.string(),
});

export const wrapJsxOpSchema = z.object({
  type: z.literal('wrapJsx'),
  /** JSX expression to wrap, e.g. '{children}'. Treated as a literal string match. */
  target: z.string(),
  /** Component name to wrap with, e.g. 'ThemeProvider'. */
  component: z.string(),
  /**
   * Component props.
   * - string value  → propName="value"
   * - boolean true  → propName  (JSX shorthand)
   * - boolean false → propName={false}
   */
  props: z.record(z.union([z.string(), z.boolean()])).optional(),
});

export const patchOpSchema = z.discriminatedUnion('type', [
  insertAfterOpSchema,
  replaceOpSchema,
  wrapJsxOpSchema,
]);

export const filePatchSchema = z.object({
  /** Path relative to the target project root (e.g. 'src/app/layout.tsx'). */
  file: z.string(),
  /** Skip all ops for this file if it already contains this string (idempotency guard). */
  idempotentIf: z.string().optional(),
  /** Run `pnpm exec prettier --write` on the file after all ops are applied. */
  format: z.boolean().optional(),
  ops: z.array(patchOpSchema),
});

/**
 * Value type for entries in the `dependents` map.
 * - string  → path to a compiled JS handler (escape hatch for complex logic)
 * - object  → declarative patch list applied by the CLI patch engine
 */
export const dependentEntrySchema = z.union([
  z.string(),
  z.object({ patches: z.array(filePatchSchema) }),
]);

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
   * Per-tool integration handlers, keyed by the consuming scaffold tool name.
   * Each entry is either:
   *   - a string  → path to a compiled JS handler file under dependents/
   *   - an object → declarative patch list run by the CLI patch engine
   * e.g. `{ nextjs: { patches: [...] }, expo: "expo.js" }`
   */
  dependents: z.record(dependentEntrySchema).optional(),
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
export type InsertAfterOp = z.infer<typeof insertAfterOpSchema>;
export type ReplaceOp = z.infer<typeof replaceOpSchema>;
export type WrapJsxOp = z.infer<typeof wrapJsxOpSchema>;
export type PatchOp = z.infer<typeof patchOpSchema>;
export type FilePatch = z.infer<typeof filePatchSchema>;
export type DependentEntry = z.infer<typeof dependentEntrySchema>;
export type MoonTaskOptions = z.infer<typeof moonTaskOptionsSchema>;
export type MoonTask = z.infer<typeof moonTaskSchema>;
export type LinkVariant = z.infer<typeof linkVariantSchema>;
export type LinkConfig = z.infer<typeof linkConfigSchema>;
export type DevtoolEntry = z.infer<typeof devtoolEntrySchema>;
export type ScaffoldConfig = z.infer<typeof scaffoldConfigSchema>;
export type ClaudeHookEntry = z.infer<typeof claudeHookEntrySchema>;
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
export type ToolConfig = z.infer<typeof toolConfigSchema>;
