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
    const { name, scope } = cli.flags;

    if (!name) {
      return <Text color="red">Error: --name is required for init command</Text>;
    }

    // Run init command asynchronously
    initCommand({ name, scope })
      .then((result) => {
        if (result.success) {
          console.log(`\n✅ Monorepo initialized at: ${result.projectRoot}`);
        } else {
          console.error(`\n❌ Failed to initialize: ${result.error}`);
          process.exit(1);
        }
      })
      .catch((err) => {
        console.error(`\n❌ Unexpected error: ${err.message}`);
        process.exit(1);
      });

    return <InitCommand name={name} scope={scope} />;
  }

  // Other commands not yet implemented
  return <Text color="yellow">Command "{command}" is not yet implemented</Text>;
}

render(<App />);
