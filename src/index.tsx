#!/usr/bin/env node
import { render, Text } from 'ink';
import meow from 'meow';

import { AddCommand, addCommand } from './commands/add.js';
import { InitCommand, initCommand } from './commands/init.js';

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

// Main app component
function App() {
  const command = cli.input[0];

  if (!command) {
    return (
      <>
        <Text bold color="cyan">
          aikuora CLI
        </Text>
        <Text>Monorepo management tool for Moon + Proto</Text>
        <Text dimColor>{'\n'}Run `aikuora --help` for available commands</Text>
      </>
    );
  }

  // Handle init command
  if (command === 'init') {
    const { name, scope, json } = cli.flags;

    if (!name) {
      if (json) {
        console.log(
          JSON.stringify({
            action: 'init',
            success: false,
            error: '--name is required for init command',
          })
        );
        process.exit(1);
      }
      return <Text color="red">Error: --name is required for init command</Text>;
    }

    // Run init command asynchronously
    initCommand({ name, scope, json })
      .then((result) => {
        if (!result.success) {
          process.exit(1);
        }
      })
      .catch((err) => {
        if (json) {
          console.log(
            JSON.stringify({
              action: 'init',
              success: false,
              error: err.message,
            })
          );
        } else {
          console.error(`\n❌ Unexpected error: ${err.message}`);
        }
        process.exit(1);
      });

    // Only show UI component in human-readable mode
    if (!json) {
      return <InitCommand name={name} scope={scope} />;
    }

    return null;
  }

  // Handle add command
  if (command === 'add') {
    const { name, variant, local, json } = cli.flags;
    const toolName = cli.input[1];
    const target = cli.input[2];

    if (!toolName) {
      if (json) {
        console.log(
          JSON.stringify({
            action: 'add',
            success: false,
            error: 'Tool name is required: aikuora add <tool>',
          })
        );
        process.exit(1);
      }
      return <Text color="red">Error: Tool name is required: aikuora add {'<tool>'}</Text>;
    }

    // Determine mode for the Ink component (heuristic)
    const mode: 'scaffold' | 'link' | 'local' | 'project' | 'install' = local
      ? 'local'
      : name
        ? 'scaffold'
        : target
          ? toolName.includes('/')
            ? 'project'
            : 'link'
          : 'install'; // no target, no name, no local → shareable/root install

    addCommand({ toolName, target, name, variant, local, json })
      .then((result) => {
        if (!result.success) {
          process.exit(1);
        }
      })
      .catch((err: Error) => {
        if (json) {
          console.log(
            JSON.stringify({
              action: 'add',
              success: false,
              error: err.message,
            })
          );
        } else {
          console.error(`\n❌ Unexpected error: ${err.message}`);
        }
        process.exit(1);
      });

    if (!json) {
      return <AddCommand mode={mode} toolName={toolName} name={name} target={target} />;
    }

    return null;
  }

  // Other commands not yet implemented
  return <Text color="yellow">Command "{command}" is not yet implemented</Text>;
}

render(<App />);
