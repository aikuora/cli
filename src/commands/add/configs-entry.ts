import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import fse from 'fs-extra';

import { ensureRootPeerDeps, sortDeps } from '../../utils/integration-patches.js';
import { writeProjectFile } from '../../utils/project-file.js';

// ---------------------------------------------------------------------------
// Private helper (module-internal)
// ---------------------------------------------------------------------------

function readJsonFile<T extends Record<string, unknown>>(p: string): T {
  if (!existsSync(p)) return {} as T;
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Shared package helpers (used by runShareable and runLink)
// ---------------------------------------------------------------------------

export interface SharedPackageResult {
  created: boolean;
  path: string;
  /** Full import path used in config files, e.g. scope/configs/prettier */
  packageName: string;
  /** Package name for devDependencies, e.g. scope/configs */
  configsName: string;
}

// Determine the correct package.json export patterns for a shareable tool.
// Node.js exports only allow ONE * per pattern, so we use per-tool paths:
//   prettier  (index.mjs only) → "./prettier"         → ./src/prettier/index.mjs
//   eslint    (.mjs variants)  → "./eslint/*"         → ./src/eslint/*.mjs
//   tsconfig  (.json files)    → "./tsconfig/*.json"  → ./src/tsconfig/*.json
export function buildToolExportPatterns(
  toolName: string,
  templateDir: string
): Record<string, string> {
  if (!existsSync(templateDir)) return {};

  const files = readdirSync(templateDir).filter(
    (f) => f !== 'package.json' && !statSync(join(templateDir, f)).isDirectory()
  );

  const mjsFiles = files.filter((f) => f.endsWith('.mjs'));
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const patterns: Record<string, string> = {};

  if (mjsFiles.length === 1 && mjsFiles[0] === 'index.mjs') {
    // Single entry point: @scope/configs/prettier
    patterns[`./${toolName}`] = `./src/${toolName}/index.mjs`;
  } else if (mjsFiles.length > 0) {
    // Multiple variants: @scope/configs/eslint/typescript
    patterns[`./${toolName}/*`] = `./src/${toolName}/*.mjs`;
  }

  if (jsonFiles.length > 0) {
    // JSON configs: @scope/configs/tsconfig/base.json
    patterns[`./${toolName}/*.json`] = `./src/${toolName}/*.json`;
  }

  return patterns;
}

export async function ensureConfigsEntry(
  toolName: string,
  toolPath: string,
  projectRoot: string,
  packagesDir: string,
  scope: string | undefined
): Promise<SharedPackageResult> {
  const configsPkgDir = join(projectRoot, packagesDir, 'configs');
  const configsPkgName = scope ? `${scope}/configs` : 'configs';
  // Import path used in link.content: e.g. "@scope/configs/prettier"
  const packageName = `${configsPkgName}/${toolName}`;
  const destToolDir = join(configsPkgDir, 'src', toolName);

  // ── Step 1: Create or update packages/configs/package.json ───────────────
  const pkgJsonPath = join(configsPkgDir, 'package.json');
  let pkgJson: Record<string, unknown>;

  if (!existsSync(pkgJsonPath)) {
    await mkdir(configsPkgDir, { recursive: true });
    pkgJson = {
      name: configsPkgName,
      version: '0.0.0',
      private: true,
      type: 'module',
      exports: {},
    };
  } else {
    pkgJson = readJsonFile<Record<string, unknown>>(pkgJsonPath);
  }

  // Build per-tool export patterns (one * per pattern — Node.js requirement).
  const currentExports = (pkgJson.exports as Record<string, string>) ?? {};
  const toolPatterns = buildToolExportPatterns(toolName, join(toolPath, 'template'));
  for (const [pattern, target] of Object.entries(toolPatterns)) {
    if (!(pattern in currentExports)) currentExports[pattern] = target;
  }
  pkgJson.exports = currentExports;

  // Merge dependencies from tool's template/package.json (new keys only)
  const toolPkgJsonPath = join(toolPath, 'template', 'package.json');
  let peerDepsToPropagate: Record<string, string> = {};
  if (existsSync(toolPkgJsonPath)) {
    const toolPkg = readJsonFile<Record<string, unknown>>(toolPkgJsonPath);
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      if (toolPkg[field] && typeof toolPkg[field] === 'object') {
        const merged = (pkgJson[field] as Record<string, string>) ?? {};
        for (const [dep, version] of Object.entries(toolPkg[field] as Record<string, string>)) {
          if (!(dep in merged)) merged[dep] = version;
        }
        pkgJson[field] = sortDeps(merged);
      }
    }
    if (toolPkg.peerDependencies && typeof toolPkg.peerDependencies === 'object') {
      peerDepsToPropagate = toolPkg.peerDependencies as Record<string, string>;
    }
  }
  await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');

  // Propagate peerDependencies to the root workspace package.json
  if (Object.keys(peerDepsToPropagate).length > 0) {
    await ensureRootPeerDeps(projectRoot, peerDepsToPropagate);
  }

  // ── Step 2: Copy tool template/ files (excluding package.json) to src/<name>/ ──
  const created = !existsSync(destToolDir);
  if (created) {
    const templateDir = join(toolPath, 'template');
    if (!existsSync(templateDir)) {
      throw new Error(`Tool '${toolName}' has kind: shareable but no template/ directory`);
    }
    await fse.copy(templateDir, destToolDir, {
      filter: (src) => !src.endsWith('package.json'),
    });
  }

  // ── Step 3: Write aikuora.project.yml for packages/configs/ once ─────────
  if (!existsSync(join(configsPkgDir, 'aikuora.project.yml'))) {
    await writeProjectFile(configsPkgDir, {
      tool: 'configs',
      type: 'package',
      dependencies: { tools: [], projects: [] },
    });
  }

  return { created, path: destToolDir, packageName, configsName: configsPkgName };
}
