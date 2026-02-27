import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Private helper (module-internal)
// ---------------------------------------------------------------------------

function readJsonFile<T extends Record<string, unknown>>(p: string): T {
  if (!existsSync(p)) return {} as T;
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Dependency sorting
// ---------------------------------------------------------------------------

export function sortDeps(deps: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

// ---------------------------------------------------------------------------
// tsconfig / CSS helpers (used when wiring workspace packages)
// ---------------------------------------------------------------------------

/**
 * Patch a tsconfig.json to add path aliases pointing to a package's own src/.
 * Used for the package itself (self-referential aliases).
 * Idempotent: skips if the key already exists.
 */
export async function patchTsconfigPaths(
  tsconfigPath: string,
  scopedName: string,
  srcBase: string
): Promise<void> {
  if (!existsSync(tsconfigPath)) return;
  const tsconfig = readJsonFile<Record<string, unknown>>(tsconfigPath);
  const co = (tsconfig.compilerOptions as Record<string, unknown>) ?? {};
  const paths = (co.paths as Record<string, string[]>) ?? {};
  const key = `${scopedName}/*`;
  if (key in paths) return;
  paths[key] = [`${srcBase}/*`];
  co.paths = paths;
  tsconfig.compilerOptions = co;
  await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');
}

/**
 * Patch a tsconfig.json to add a TypeScript project reference.
 * Used by consumer apps to reference workspace packages.
 * Idempotent: skips if the reference path already exists.
 */
export async function patchTsconfigReferences(
  tsconfigPath: string,
  refPath: string
): Promise<void> {
  if (!existsSync(tsconfigPath)) return;
  const tsconfig = readJsonFile<Record<string, unknown>>(tsconfigPath);
  const refs = (tsconfig.references as Array<{ path: string }>) ?? [];
  if (refs.some((r) => r.path === refPath)) return;
  refs.push({ path: refPath });
  tsconfig.references = refs;
  await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');
}

/**
 * Inject `@import "<scopedName>/globals.css"` into a CSS file, right after the
 * first existing @import line. Idempotent: no-op if already present.
 */
export async function injectCssImport(cssPath: string, scopedName: string): Promise<void> {
  if (!existsSync(cssPath)) return;
  let css = readFileSync(cssPath, 'utf-8');
  const importLine = `@import "${scopedName}/globals.css";`;
  if (css.includes(importLine)) return;
  // Insert after the first @import line (e.g. @import "tailwindcss")
  css = css.replace(/(@import ['"][^'"]+['"];?\n)/, `$1${importLine}\n`);
  await writeFile(cssPath, css, 'utf-8');
}

/**
 * Add peerDependencies from a package to the root workspace package.json devDependencies.
 * Skips keys that are already present. No-ops if root package.json doesn't exist.
 */
export async function ensureRootPeerDeps(
  projectRoot: string,
  peerDeps: Record<string, string>
): Promise<void> {
  const rootPkgPath = join(projectRoot, 'package.json');
  if (!existsSync(rootPkgPath)) return;

  const rootPkg = readJsonFile<Record<string, unknown>>(rootPkgPath);
  const devDeps = (rootPkg.devDependencies as Record<string, string>) ?? {};

  let changed = false;
  for (const [dep, version] of Object.entries(peerDeps)) {
    if (!(dep in devDeps)) {
      devDeps[dep] = version;
      changed = true;
    }
  }

  if (changed) {
    rootPkg.devDependencies = sortDeps(devDeps);
    await writeFile(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf-8');
  }
}
