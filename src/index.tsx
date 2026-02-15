#!/usr/bin/env node
import { render, Text } from 'ink';
import meow from 'meow';

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

  // Commands will be implemented in subsequent phases
  return <Text color="yellow">Command "{command}" is not yet implemented</Text>;
}

render(<App />);
