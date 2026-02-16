import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import Handlebars from 'handlebars';

/**
 * Get the path to the templates directory
 */
export function getTemplatesPath(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const cliRoot = resolve(dirname(currentFilePath), '../');
  return join(cliRoot, 'templates');
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

  await copyDirectory(templatePath, destination, variables);
}

/**
 * Recursively copy directory, rendering .hbs files with Handlebars
 */
async function copyDirectory(
  source: string,
  destination: string,
  variables: Record<string, unknown>
): Promise<void> {
  await mkdir(destination, { recursive: true });

  const entries = await readdir(source);

  for (const entry of entries) {
    const sourcePath = join(source, entry);
    const destPath = join(destination, entry);
    const stats = await stat(sourcePath);

    if (stats.isDirectory()) {
      await copyDirectory(sourcePath, destPath, variables);
    } else {
      // Check if file is a Handlebars template (.hbs)
      if (entry.endsWith('.hbs')) {
        // Read template, render with Handlebars, write without .hbs extension
        const templateContent = await readFile(sourcePath, 'utf-8');
        const template = Handlebars.compile(templateContent);
        const rendered = template(variables);
        const destPathWithoutHbs = destPath.replace(/\.hbs$/, '');
        await writeFile(destPathWithoutHbs, rendered);
      } else if (entry.endsWith('.template')) {
        // Copy .template files without the .template extension
        const templateContent = await readFile(sourcePath, 'utf-8');
        const destPathWithoutTemplate = destPath.replace(/\.template$/, '');
        await writeFile(destPathWithoutTemplate, templateContent);
      } else {
        // Copy file as-is
        await copyFile(sourcePath, destPath);
      }
    }
  }
}
