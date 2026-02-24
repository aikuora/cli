# Codebase Intelligence

<!-- Keep this file concise. It is read at every session start. -->

## Project Type & Stack

CLI tool — Node.js 24+ with TypeScript 5, compiled to ESM via tsup, published as `@aikuora/cli`.

- Terminal UI: Ink 5 + React 18 (human mode) / `console.log(JSON.stringify(...))` (--json mode)
- CLI parsing: meow 13
- Config validation: Zod 3
- YAML parsing: yaml 2
- File operations: fs-extra 11
- Templates: Handlebars 4
- Tests: Vitest 4
- Build: tsup 8

## Key Directories

```text
src/
  commands/       — one file per CLI subcommand (init.tsx, add.tsx; info.tsx and list.tsx to add)
  core/           — tool discovery, loading, and resolution (scanner.ts, loader.ts, resolver.ts)
  managers/       — workspace config CRUD (config.ts reads/writes aikuora.workspace.yml)
  types/          — Zod schemas + inferred TypeScript types (config.ts, tool-config.ts, project.ts, tool.ts)
  utils/          — shared utilities (output.ts, moon.ts, prototools.ts, template.ts,
                    integration.ts, integration-fs.ts, project-file.ts)
                    — workspace.ts (to create: STARTUP-001 guard + project scanner)

tools/            — 11 built-in tools, each with an aikuora.tool.yml
  <name>/
    aikuora.tool.yml   — tool config (kind, scaffold, link, workspace, requires, dependents)
    template/          — shareable tool content copied to packages/configs/src/<name>/
    templates/         — scaffold templates rendered into new project directories
    dependents/        — JS integration handlers keyed by scaffold tool name

templates/
  init/           — workspace init template (aikuora.workspace.yml.hbs, .moon/workspace.yml.hbs, etc.)
```

## Entry Points

- CLI: `src/index.tsx` — parses args with meow, routes to command handlers, renders Ink component
- Build output: `dist/index.js` — single bundle (tsup, external: react + ink)
- Tests: `vitest.config.ts` or inline; test files co-located as `*.test.ts`

## Code Patterns

### Command handler pattern

Every command is split into two parts:

1. An async function `<name>Command(options)` that contains all logic and returns
   `{ success: boolean }`. It calls `output(...)` or `outputError(...)` internally.
2. An Ink component `<Name>Command` that renders a status line for human mode.

```typescript
// In src/index.tsx:
<name>Command({ ...flags, json })
  .then((r) => { if (!r.success) process.exit(1); })
  .catch(...)

if (!json) return <NameCommand ... />;
return null;
```

### Config read pattern

```typescript
const configResult = readConfig();
if (!configResult.success) {
  const err = configResult.error?.message ?? 'Could not read project config';
  if (json) output({ action, success: false, error: err }, { json });
  else outputError(err, { json });
  return { success: false };
}
const rootConfig = configResult.data!;
```

### Tool resolution pattern

```typescript
const tools = scanAllTools(projectRoot, rootConfig.customTools);
const discovered = resolveTool(toolName, tools);
if (!discovered) { /* error */ }
const loaderResult = loadToolConfig(discovered.path);
if (!loaderResult.success) { /* error */ }
const toolConfig = loaderResult.data!;
```

### Project file read/write

```typescript
// Read (returns null if missing or invalid):
const project = readProjectFile(targetDir);

// Write (creates or overwrites):
await writeProjectFile(targetDir, { tool, type, dependencies });

// Append tool dependency (idempotent):
await appendToolDependency(targetDir, toolName);
```

### Workspace integration (declarative + JS handler)

Workspace-level files are merged idempotently in `src/commands/add.tsx`:

- `.vscode/settings.json` via `mergeVscodeSettings` (with key conflict warnings)
- `.vscode/extensions.json` via `mergeVscodeExtensions`
- `.claude/settings.json` via `mergeClaudeHooks`
- `.moon/tasks/<file>.yml` via `addInheritedMoonTasks`
- `.gitignore` via `mergeGitignore`

Integration handlers for project dependencies (declarative patches or JS files)
are dispatched via `invokeIntegrationHandler` in `src/utils/integration.ts`.

## Conventions

- File names: `kebab-case.ts` for utilities, `kebab-case.tsx` for components/commands
- TypeScript types: inferred from Zod (`z.infer<typeof schema>`); never declared separately
- Exports: named exports only; no default exports from command files
- Error returns: functions return `{ success: boolean }` — they never throw to callers;
  errors are reported inline before returning `{ success: false }`
- Output: `outputSuccess` / `outputError` / `output` from `src/utils/output.ts` — never
  call `console.log` directly except for JSON mode
- Path resolution: all paths use `resolve(cwd)` at function entry; `join(...)` for
  path construction thereafter
- Schema files: one Zod schema file per domain object in `src/types/`

## Active Context

**Current task:** (none — run /plan tasks to get started)

**Relevant files:** (none)

**Recent discoveries:** (none)
