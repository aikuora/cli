import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * Parse a .prototools file into a key-value record.
 *
 * Only reads top-level keys and keys inside a [tools] section.
 * Keys inside [settings] or other sections are ignored.
 */
export function readPrototools(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, 'utf-8');
  return parsePrototools(content);
}

function parsePrototools(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentSection: string | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('[')) {
      const end = line.indexOf(']');
      currentSection = end > 1 ? line.slice(1, end) : '';
      continue;
    }

    // Only read from top-level (no section) or [tools] section
    if (currentSection !== null && currentSection !== 'tools') continue;

    const match = /^([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/.exec(line);
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return result;
}

function buildPrototools(existing: string, additions: Record<string, string>): string {
  const current = parsePrototools(existing);
  const newKeys = Object.entries(additions).filter(([k]) => !(k in current));

  if (newKeys.length === 0) {
    return existing;
  }

  const insertion = newKeys.map(([k, v]) => `${k} = "${v}"`).join('\n');

  if (!existing.trim()) {
    return insertion + '\n';
  }

  const lines = existing.split('\n');

  // If there's a [tools] section, insert at the end of it
  const toolsSectionIdx = lines.findIndex((l) => l.trim() === '[tools]');
  if (toolsSectionIdx >= 0) {
    let insertAt = lines.length;
    for (let i = toolsSectionIdx + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith('[')) {
        insertAt = i;
        break;
      }
    }
    lines.splice(insertAt, 0, insertion);
    const out = lines.join('\n');
    return out.endsWith('\n') ? out : out + '\n';
  }

  // No [tools] section — insert before the first [section] header so keys
  // don't accidentally fall inside [settings] or other sections.
  const firstSectionIdx = lines.findIndex((l) => /^\[/.test(l.trim()));
  if (firstSectionIdx >= 0) {
    // Walk back past any trailing blank lines before the section header,
    // then replace them with the new keys + a single blank separator.
    // This prevents accumulating extra blank lines on repeated insertions.
    let insertAt = firstSectionIdx;
    while (insertAt > 0 && lines[insertAt - 1].trim() === '') {
      insertAt--;
    }
    lines.splice(insertAt, firstSectionIdx - insertAt, insertion, '');
    const out = lines.join('\n');
    return out.endsWith('\n') ? out : out + '\n';
  }

  // Flat file with no sections — append
  const base = existing.endsWith('\n') ? existing : existing + '\n';
  return base + insertion + '\n';
}

/**
 * Merge new keys into a .prototools file, skipping keys already present.
 * Always inserts tool version keys before any [settings] or other sections.
 */
export async function updatePrototools(
  filePath: string,
  additions: Record<string, string>
): Promise<void> {
  let existing = '';

  if (existsSync(filePath)) {
    existing = readFileSync(filePath, 'utf-8');
  }

  const updated = buildPrototools(existing, additions);
  await writeFile(filePath, updated, 'utf-8');
}

/**
 * Pin a proto-managed tool version to .prototools using `proto pin --resolve`,
 * so the actual resolved version (e.g. "22.14.0") is written instead of the alias ("lts").
 *
 * - Skips the pin if the tool is already present in the file (idempotent).
 * - Falls back to a manual alias write if proto is not available.
 */
export async function pinProtoVersion(
  projectRoot: string,
  tool: string,
  version: string
): Promise<void> {
  const filePath = join(projectRoot, '.prototools');

  // Skip if the tool is already pinned
  if (tool in readPrototools(filePath)) return;

  try {
    execFileSync('proto', ['pin', tool, version, '--resolve', '--to', 'local', '--yes'], {
      cwd: projectRoot,
      stdio: 'ignore',
      timeout: 30_000,
    });
    // proto pin writes the file without blank lines before section headers — fix formatting
    await reformatPrototools(filePath);
  } catch {
    // proto not available or tool not supported — fall back to writing the alias
    await updatePrototools(filePath, { [tool]: version });
  }
}

/**
 * Ensure there is a blank line before each section header (e.g. [settings]).
 * proto pin writes the file without separators; this restores consistent formatting.
 */
async function reformatPrototools(filePath: string): Promise<void> {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf-8').split('\n');
  const result: string[] = [];

  for (const line of lines) {
    if (/^\[/.test(line.trim()) && result.length > 0 && result[result.length - 1].trim() !== '') {
      result.push('');
    }
    result.push(line);
  }

  await writeFile(filePath, result.join('\n'), 'utf-8');
}
