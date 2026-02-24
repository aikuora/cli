import { access, copyFile, mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import Handlebars from 'handlebars';

/**
 * Get the path to the templates directory
 */
export function getTemplatesPath(): string {
  // Bundled:  import.meta.url → dist/index.js    → dirname = dist/       → 1 level up = CLI root
  // Dev/test: import.meta.url → src/utils/template.ts → dirname = src/utils/ → 2 levels up = CLI root
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);
  const cliRoot =
    basename(currentDir) === 'dist'
      ? resolve(currentDir, '..')
      : resolve(currentDir, '../..');
  return join(cliRoot, 'templates');
}

/**
 * Render and copy an arbitrary source directory to a destination.
 * Accepts an absolute source path (useful for tool template/ directories outside of templates/).
 *
 * @param skipExisting - When true, skips files that already exist at the destination.
 *   Use this for root tool templates to avoid overwriting user-modified files on re-runs.
 */
export async function renderAndCopy(
  sourceDir: string,
  destination: string,
  variables: Record<string, unknown> = {},
  options: { skipExisting?: boolean } = {}
): Promise<void> {
  await copyDirectory(sourceDir, destination, variables, options.skipExisting ?? false);
}

/**
 * Copy template directory to destination, rendering Handlebars templates
 */
export async function copyTemplate(
  templateName: string,
  destination: string,
  variables: Record<string, unknown> = {}
): Promise<void> {
  const templatesPath = getTemplatesPath();
  const templatePath = join(templatesPath, templateName);

  await copyDirectory(templatePath, destination, variables, false);
}

/**
 * Recursively copy directory, rendering .hbs files with Handlebars
 */
async function copyDirectory(
  source: string,
  destination: string,
  variables: Record<string, unknown>,
  skipExisting: boolean
): Promise<void> {
  await mkdir(destination, { recursive: true });

  const entries = await readdir(source);

  for (const entry of entries) {
    const sourcePath = join(source, entry);
    const destPath = join(destination, entry);
    const stats = await stat(sourcePath);

    if (stats.isDirectory()) {
      await copyDirectory(sourcePath, destPath, variables, skipExisting);
    } else if (entry.endsWith('.hbs')) {
      const destPathWithoutHbs = destPath.replace(/\.hbs$/, '');
      if (skipExisting && (await exists(destPathWithoutHbs))) continue;
      const templateContent = await readFile(sourcePath, 'utf-8');
      const template = Handlebars.compile(templateContent);
      const rendered = template(variables);
      await writeFile(destPathWithoutHbs, rendered);
    } else if (entry.endsWith('.template')) {
      const destPathWithoutTemplate = destPath.replace(/\.template$/, '');
      if (skipExisting && (await exists(destPathWithoutTemplate))) continue;
      const templateContent = await readFile(sourcePath, 'utf-8');
      await writeFile(destPathWithoutTemplate, templateContent);
    } else {
      if (skipExisting && (await exists(destPath))) continue;
      await copyFile(sourcePath, destPath);
    }
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
