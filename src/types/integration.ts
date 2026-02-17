/**
 * Integration handler API — the contract between the CLI and tool dependents/ scripts.
 *
 * Each file under tools/<tool>/dependents/<scaffold-tool>.ts must export
 * an `integrate` function that satisfies IntegrationHandler.
 *
 * This is the internal API today and will become the public SDK API when
 * third-party tools are supported.
 */

export interface ProjectInfo {
  /** Absolute path to the project directory */
  path: string;
  /** Scaffold tool used to create this project (e.g. "nextjs", "expo") */
  tool: string;
  type: 'app' | 'package' | 'module';
  /** npm scope from workspace config (e.g. "\@my-project") */
  scope?: string;
}

export interface SourceInfo {
  /** Absolute path to the package directory */
  path: string;
  /** Directory name relative to workspace root (e.g. "packages/ui") */
  name: string;
  /** Scoped package name (e.g. "\@my-project/ui") */
  scopedName: string;
}

export interface WorkspaceInfo {
  /** Absolute path to the monorepo root */
  root: string;
  scope?: string;
}

/**
 * Filesystem helpers exposed to integration handlers.
 * Scoped operations prevent handlers from escaping the workspace.
 */
export interface IntegrationFs {
  /** Insert a line after the first line matching pattern */
  insertAfterLine(file: string, pattern: RegExp, content: string): Promise<void>;
  /** Append content to the end of a file */
  appendToFile(file: string, content: string): Promise<void>;
  /** Prepend content to the beginning of a file */
  prependToFile(file: string, content: string): Promise<void>;
  /** Deep-merge a JSON patch into an existing JSON file */
  mergeJson(file: string, patch: Record<string, unknown>): Promise<void>;
  /** Render a Handlebars template string and write to dest */
  renderTemplate(template: string, dest: string, vars: Record<string, unknown>): Promise<void>;
  fileExists(file: string): Promise<boolean>;
}

export interface IntegrationContext {
  /** The project that is consuming the source package */
  target: ProjectInfo;
  /** The package being added as a project dependency */
  source: SourceInfo;
  workspace: WorkspaceInfo;
  /** Scoped filesystem helpers */
  fs: IntegrationFs;
}

/** The function signature every dependents/ handler must export as `integrate` */
export type IntegrationHandler = (ctx: IntegrationContext) => Promise<void>;
