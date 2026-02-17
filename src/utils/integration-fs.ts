import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';

import Handlebars from 'handlebars';

import type { IntegrationFs } from '../types/integration.js';

/**
 * Create a runtime implementation of IntegrationFs.
 * All file operations use absolute paths; callers are responsible for
 * providing correct paths within the workspace.
 */
export function createIntegrationFs(): IntegrationFs {
  return {
    async insertAfterLine(file, pattern, content) {
      const text = await readFile(file, 'utf-8');
      const lines = text.split('\n');
      const idx = lines.findIndex((l) => pattern.test(l));

      if (idx === -1) {
        // Pattern not found — append to end
        const suffix = text.endsWith('\n') ? '' : '\n';
        await writeFile(file, text + suffix + content + '\n', 'utf-8');
        return;
      }

      lines.splice(idx + 1, 0, content);
      await writeFile(file, lines.join('\n'), 'utf-8');
    },

    async appendToFile(file, content) {
      let existing = '';
      if (existsSync(file)) {
        existing = await readFile(file, 'utf-8');
      }
      if (existing.length > 0 && !existing.endsWith('\n')) existing += '\n';
      await writeFile(file, existing + content, 'utf-8');
    },

    async prependToFile(file, content) {
      let existing = '';
      if (existsSync(file)) {
        existing = await readFile(file, 'utf-8');
      }
      const separator = existing.length > 0 ? '\n' : '';
      await writeFile(file, content + separator + existing, 'utf-8');
    },

    async mergeJson(file, patch) {
      let current: Record<string, unknown> = {};
      if (existsSync(file)) {
        const raw = await readFile(file, 'utf-8');
        current = JSON.parse(raw) as Record<string, unknown>;
      }
      const merged = deepMerge(current, patch);
      await writeFile(file, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    },

    async renderTemplate(template, dest, vars) {
      const compiled = Handlebars.compile(template);
      await writeFile(dest, compiled(vars), 'utf-8');
    },

    async fileExists(file) {
      return existsSync(file);
    },
  };
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
