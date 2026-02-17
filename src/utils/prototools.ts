import { existsSync, readFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';

/**
 * Parse a .prototools file into a key-value record
 *
 * .prototools is a TOML-like format:
 *   node = "20.0.0"
 *   pnpm = "9.0.0"
 *
 * or nested under a [tools] section.
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
  let inToolsSection = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Handle section headers
    if (line.startsWith('[')) {
      inToolsSection = line === '[tools]';
      continue;
    }

    // Only parse key=value pairs (either at top level or in [tools] section)
    const match = /^([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/.exec(line);
    if (match) {
      // If we're in a different section, skip
      if (!inToolsSection && content.includes('[tools]')) {
        // File has sections — only read from [tools]
        continue;
      }
      const [, key, value] = match;
      result[key] = value;
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

  let output = existing;

  // Ensure trailing newline
  if (output.length > 0 && !output.endsWith('\n')) {
    output += '\n';
  }

  // Check if there's a [tools] section
  const hasToolsSection = output.includes('[tools]');

  if (hasToolsSection) {
    // Append after [tools] section — find insert point
    const lines = output.split('\n');
    let toolsSectionEnd = -1;

    let inTools = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '[tools]') {
        inTools = true;
        continue;
      }
      if (inTools) {
        if (line.startsWith('[') || i === lines.length - 1) {
          toolsSectionEnd = i;
          break;
        }
      }
    }

    const insertion = newKeys.map(([k, v]) => `${k} = "${v}"`).join('\n');
    if (toolsSectionEnd === -1) {
      output = output + insertion + '\n';
    } else {
      lines.splice(toolsSectionEnd, 0, insertion);
      output = lines.join('\n');
      if (!output.endsWith('\n')) output += '\n';
    }
  } else {
    // Flat file — just append
    const insertion = newKeys.map(([k, v]) => `${k} = "${v}"`).join('\n');
    output = output + insertion + '\n';
  }

  return output;
}

/**
 * Merge new keys into a .prototools file, skipping keys already present.
 */
export async function updatePrototools(
  filePath: string,
  additions: Record<string, string>
): Promise<void> {
  let existing = '';

  if (existsSync(filePath)) {
    existing = await readFile(filePath, 'utf-8');
  }

  const updated = buildPrototools(existing, additions);
  await writeFile(filePath, updated, 'utf-8');
}
