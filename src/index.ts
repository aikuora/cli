#!/usr/bin/env node
import meow from 'meow';

import { addCommand } from './commands/add.js';
import { infoCommand } from './commands/info.js';
import { initCommand } from './commands/init.js';
import { listCommand } from './commands/list.js';

const cli = meow(
  `
  Usage
    $ aikuora <command> [options]

  Commands
    init              Initialize a new monorepo
    add <tool>        Add a tool (scaffold, link, or fork)
    sync              Synchronize monorepo state
    info              Show monorepo status
    list <type>       List tools/apps/packages/modules

  Options
    --help            Show this help message
    --version         Show version number
    --json            Output in JSON format

  Examples
    $ aikuora init --name my-project --scope @my-project
    $ aikuora add nextjs --name dashboard
    $ aikuora add prettier apps/dashboard
    $ aikuora add prettier --local
`,
  {
    importMeta: import.meta,
    flags: {
      json: {
        type: 'boolean',
        default: false,
      },
      name: {
        type: 'string',
      },
      scope: {
        type: 'string',
      },
      variant: {
        type: 'string',
      },
      local: {
        type: 'boolean',
        default: false,
      },
    },
  }
);

const { json } = cli.flags;
const command = cli.input[0];

function exitError(action: string, message: string): never {
  if (json) {
    console.log(JSON.stringify({ action, success: false, error: message }));
  } else {
    console.error(`\n❌ ${message}`);
  }
  process.exit(1);
}

async function main() {
  if (!command) {
    console.log('\naikuora CLI — Monorepo management tool for Moon + Proto');
    console.log('Run `aikuora --help` for available commands');
    return;
  }

  if (command === 'init') {
    const { name, scope } = cli.flags;
    if (!name) exitError('init', '--name is required for init command');
    if (!scope) exitError('init', '--scope is required for init command');
    const result = await initCommand({ name, scope, json });
    if (!result.success) process.exit(1);
    return;
  }

  if (command === 'add') {
    const { name, variant, local } = cli.flags;
    const toolName = cli.input[1];
    const target = cli.input[2];
    if (!toolName) exitError('add', 'Tool name is required: aikuora add <tool>');
    const result = await addCommand({ toolName, target, name, variant, local, json });
    if (!result.success) process.exit(1);
    return;
  }

  if (command === 'info') {
    const result = await infoCommand({ json });
    if (!result.success) process.exit(1);
    return;
  }

  if (command === 'list') {
    const type = cli.input[1] ?? '';
    if (!type) exitError('list', 'Type is required: aikuora list <type>');
    const result = await listCommand({ type, json });
    if (!result.success) process.exit(1);
    return;
  }

  exitError(command, `Command "${command}" is not yet implemented`);
}

main().catch((err: Error) => {
  if (json) {
    console.log(JSON.stringify({ success: false, error: err.message }));
  } else {
    console.error(`\n❌ Unexpected error: ${err.message}`);
  }
  process.exit(1);
});
