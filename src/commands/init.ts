import { resolve } from 'path';

import { createDefaultConfig, findConfigPath } from '../managers/config.js';
import type { OutputOptions } from '../utils/output.js';
import { output, outputError, outputSuccess } from '../utils/output.js';
import { copyTemplate } from '../utils/template.js';

export interface InitOptions extends OutputOptions {
  name: string;
  scope: string;
  cwd?: string;
}

export async function initCommand(options: InitOptions) {
  const { name, scope, cwd = process.cwd(), json } = options;
  const projectRoot = resolve(cwd);

  // INIT-001: abort if already inside an existing aikuora workspace
  const existingConfig = findConfigPath(projectRoot);
  if (existingConfig) {
    const err = `Cannot initialize workspace inside an existing aikuora workspace at ${existingConfig}`;
    if (json) output({ action: 'init', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  // Validate scope format before writing any files
  if (!/^@[a-z0-9-]+$/.test(scope)) {
    const err = `Invalid scope '${scope}': must match /^@[a-z0-9-]+$/ (e.g. @my-project)`;
    if (json) output({ action: 'init', success: false, error: err }, { json });
    else outputError(err, { json });
    return { success: false };
  }

  try {
    // Build template context from default config so .hbs files have access to structure/defaults
    const defaultConfig = createDefaultConfig(name, scope);
    const templateContext = {
      name,
      scope,
      structure: defaultConfig.structure,
      defaults: defaultConfig.defaults,
    };

    // Copy init template with Handlebars variables
    await copyTemplate('init', projectRoot, templateContext);

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

