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
                    integration.ts, integration-fs.ts, project-file.ts,
                    workspace.ts — STARTUP-001 guard via validateWorkspace)

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

### Workspace validation pattern (STARTUP-001)

Every command handler except `init` must call `validateWorkspace` first:

```typescript
const wsResult = validateWorkspace(projectRoot);
if (!wsResult.valid) {
  if (json) output({ action, success: false, error: wsResult.error }, { json });
  else outputError(wsResult.error, { json });
  return { success: false };
}
const rootConfig = wsResult.config;
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

**Current task:** P3-02 complete (Phase 3 complete — STARTUP-001 Workspace Validation Guard done)

**Relevant files:**

- `/Users/ccosming/Github/aikuora/cli/src/utils/workspace.ts` — NEW: `validateWorkspace(cwd?)` returning `{ valid: true, config } | { valid: false, error }`. Uses `findConfigPath` + `readConfig`; extracts field-level Zod error messages for `name` and `scope`.
- `/Users/ccosming/Github/aikuora/cli/src/utils/workspace.test.ts` — NEW: 9 unit tests (missing config, invalid YAML, empty/missing name, invalid/missing scope, valid config, walk-up).
- `/Users/ccosming/Github/aikuora/cli/src/commands/add.tsx` — `validateWorkspace` wired as the first step in `addCommand`; `readConfig` import removed.
- `/Users/ccosming/Github/aikuora/cli/src/commands/add/root.ts` — `readConfig` replaced with `validateWorkspace`.
- `/Users/ccosming/Github/aikuora/cli/src/commands/add/shareable.ts` — `readConfig` replaced with `validateWorkspace`.
- `/Users/ccosming/Github/aikuora/cli/src/commands/add/link.ts` — `readConfig` replaced with `validateWorkspace`.
- `/Users/ccosming/Github/aikuora/cli/src/commands/add/scaffold.ts` — `readConfig` replaced with `validateWorkspace`.
- `/Users/ccosming/Github/aikuora/cli/src/commands/add/project-dep.ts` — `readConfig` replaced with `validateWorkspace`.

**Recent discoveries:**

- `validateWorkspace` extracts Zod field errors via a typed cast on `result.error?.details` (output of `error.format()`), accessing `details.name._errors[0]` and `details.scope._errors[0]`.
- `init` command is intentionally exempt from `validateWorkspace` — it creates the workspace config, so it cannot pre-validate one.
- `runLocal` requires no `validateWorkspace` call of its own because `addCommand` calls it first; `runLocal` only uses built-in tools (no config needed).
