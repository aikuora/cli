import { mkdir } from 'fs/promises';
import { resolve } from 'path';

import { Text } from 'ink';

import { copyTemplate } from '../utils/template.js';

export interface InitOptions {
  name: string;
  scope?: string;
  cwd?: string;
}

export async function initCommand(options: InitOptions) {
  const { name, scope, cwd = process.cwd() } = options;
  const projectRoot = resolve(cwd);

  try {
    // Copy init template with Handlebars variables
    await copyTemplate('init', projectRoot, { name, scope });

    // Create tools directory (internal to aikuora, not a workspace dir)
    await mkdir(resolve(projectRoot, 'tools'), { recursive: true });

    return {
      success: true,
      projectRoot,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function InitCommand({ name, scope }: { name: string; scope?: string }) {
  return (
    <Text color="green">
      Initializing monorepo: {name} {scope && `(${scope})`}
    </Text>
  );
}
