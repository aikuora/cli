# Codebase Intelligence

<!-- Keep this file concise. It is read at every session start. -->

## Project Type & Stack

CLI tool — Node.js 24+ with TypeScript 5, compiled to ESM via tsup, published as `@aikuora/cli`.

- Terminal UI: `console.log` + ANSI escape codes (human mode) / `console.log(JSON.stringify(...))` (--json mode)
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
  commands/       — one file per CLI subcommand (init.ts, add.ts, info.ts, list.ts)
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

- CLI: `src/index.ts` — parses args with meow, routes to command handlers via plain `async main()`
- Build output: `dist/index.js` — single bundle (tsup)
- Tests: `vitest.config.ts` or inline; test files co-located as `*.test.ts`

## Code Patterns

### Command handler pattern

Each command is a single async function `<name>Command(options)` that contains
all logic and returns `{ success: boolean }`. It calls `output(...)` or
`outputError(...)` internally.

```typescript
// In src/index.ts (plain async main, no Ink):
const result = await addCommand({ toolName, target, name, variant, local, json });
if (!result.success) process.exit(1);
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

Workspace-level files are merged idempotently in `src/commands/add.ts`:

- `.vscode/settings.json` via `mergeVscodeSettings` (with key conflict warnings)
- `.vscode/extensions.json` via `mergeVscodeExtensions`
- `.claude/settings.json` via `mergeClaudeHooks`
- `.moon/tasks/<file>.yml` via `addInheritedMoonTasks`
- `.gitignore` via `mergeGitignore`

Integration handlers for project dependencies (declarative patches or JS files)
are dispatched via `invokeIntegrationHandler` in `src/utils/integration.ts`.

## Conventions

- File names: `kebab-case.ts` for all source files (no more `.tsx` — Ink removed)
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

**Current task:** Phase 5 complete — all Polish and Hardening tasks done (P5-01 through P5-07)

**Relevant files:**

- `src/utils/workspace.test.ts` — 3 STARTUP-001 derived_tests added using `os.tmpdir()` + `mkdtempSync`
- `src/commands/init.test.ts` — created; INIT-001 nested workspace test
- `src/commands/add.test.ts` — created; ADD-002 variant/re-link, ADD-005 local fork, TOOL-002 requires chain, ADD-001 scaffold cleanup tests (82 tests total pass)

**Recent discoveries:**

- `fs-extra` types (`@types/fs-extra`) do not expose `.default` on the module type. Mock by spreading `...original` and overriding `copy`/`remove` at top level, with the same mocks on a `default` key cast via `unknown`. Access in tests via `vi.mocked(fse.copy)` where `fse` is the default import.
- Scaffold cleanup in `runScaffold` only triggers when `existsSync(targetDir)` is true after failure. Tests mock `renderAndCopy` to create `targetDir` then throw — triggering the cleanup branch.
- `ensureRequiredTools` calls `runRoot` (not `runLink`) with `silent: true`. Re-link warnings only exist in `runLink` gated on `!silent`. Transitive requires never produce re-link warnings.
