import { mkdir } from 'fs/promises';
import { resolve } from 'path';

import { Text } from 'ink';

import type { OutputOptions } from '../utils/output.js';
import { output, outputError, outputSuccess } from '../utils/output.js';
import { copyTemplate } from '../utils/template.js';

export interface InitOptions extends OutputOptions {
  name: string;
  scope?: string;
  cwd?: string;
}

export async function initCommand(options: InitOptions) {
  const { name, scope, cwd = process.cwd(), json } = options;
  const projectRoot = resolve(cwd);

  try {
    // Copy init template with Handlebars variables
    await copyTemplate('init', projectRoot, { name, scope });

    // Create tools directory (internal to aikuora, not a workspace dir)
    await mkdir(resolve(projectRoot, 'tools'), { recursive: true });

    const result = {
      action: 'init',
      success: true,
      name,
      scope,
      projectRoot,
    };

    if (json) {
      output(result, { json });
    } else {
      outputSuccess(`Monorepo initialized at: ${projectRoot}`, { json });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const result = {
      action: 'init',
      success: false,
      name,
      scope,
      error: errorMessage,
    };

    if (json) {
      output(result, { json });
    } else {
      outputError(`Failed to initialize: ${errorMessage}`, { json });
    }

    return result;
  }
}

export function InitCommand({ name, scope }: { name: string; scope?: string }) {
  return (
    <Text color="green">
      Initializing monorepo: {name} {scope && `(${scope})`}
    </Text>
  );
}
