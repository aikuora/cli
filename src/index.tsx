#!/usr/bin/env node
import { render, Text } from 'ink';
import meow from 'meow';

import { InitCommand, initCommand } from './commands/init.js';

const cli = meow(
  `
  Usage
    $ aikuora <command> [options]

  Commands
    init              Initialize a new monorepo
    scaffold <tool>   Scaffold a new app/package/module
    link <tool>       Link a tool to a target
    add-tool <tool>   Copy a built-in tool to project
    sync              Synchronize monorepo state
    info              Show monorepo status
    list <type>       List tools/apps/packages/modules

  Options
    --help            Show this help message
    --version         Show version number
    --json            Output in JSON format

  Examples
    $ aikuora init --name my-project --scope @my-project
    $ aikuora scaffold nextjs --name dashboard
    $ aikuora link prettier apps/dashboard
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

  // Other commands not yet implemented
  return <Text color="yellow">Command "{command}" is not yet implemented</Text>;
}

render(<App />);
