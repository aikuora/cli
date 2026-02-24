---
paths:
  - "src/commands/**/*.tsx"
  - "src/index.tsx"
---

# Command Rules

## Command File Structure

Every command in `src/commands/` must contain exactly two exports:

1. An async function: `export async function <name>Command(options: <Name>Options)`
2. An Ink component: `export function <Name>Command(props)` (PascalCase React component)

The async function contains all logic. The Ink component renders a single-line
status for human mode only.

## Option Types

Every command async function takes an options object that extends `OutputOptions`:

```typescript
export interface <Name>Options extends OutputOptions {
  // command-specific fields
  cwd?: string;  // always include; defaults to process.cwd()
}
```

`OutputOptions` is `{ json: boolean }` from `src/utils/output.ts`.

## STARTUP-001 Guard

Every command handler (except `init`) must call `validateWorkspace()` as the
FIRST step and return early on failure:

```typescript
const wsResult = validateWorkspace(cwd);
if (!wsResult.valid) {
  if (json) output({ action: '<cmd>', success: false, error: wsResult.error }, { json });
  else outputError(wsResult.error!, { json });
  return { success: false };
}
const rootConfig = wsResult.config!;
```

## Return Values

All async command functions return `Promise<{ success: boolean }>` at minimum.
Additional fields in the return object are allowed for JSON output purposes.

## Index.tsx Routing

When adding a new command to `src/index.tsx`:

```typescript
if (command === '<name>') {
  const { json, ...flags } = cli.flags;
  <name>Command({ ...flags, json })
    .then((result) => { if (!result.success) process.exit(1); })
    .catch((err: Error) => {
      if (json) {
        console.log(JSON.stringify({ action: '<name>', success: false, error: err.message }));
      } else {
        console.error(`\n❌ Unexpected error: ${err.message}`);
      }
      process.exit(1);
    });

  if (!json) return <<Name>Command ... />;
  return null;
}
```

## JSON Error Shape

In `--json` mode, all errors must be structured as:

```json
{ "action": "<command-name>", "success": false, "error": "<message>" }
```

All errors exit with code 1.
