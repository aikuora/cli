---
paths:
  - "src/core/**/*.ts"
  - "src/managers/**/*.ts"
  - "src/utils/**/*.ts"
  - "tools/**/*.yml"
---

# Core, Managers, and Utils Rules

## Tool Discovery

The discovery priority order is: `customTools > tools/ > built-in`.

`scanAllTools(projectRoot, customPaths)` enforces this via object spread:
`{ ...builtInTools, ...projectTools, ...customTools }`.

When implementing `ADD-005` (local fork), scan ONLY built-in tools via
`scanBuiltInTools()`. Do NOT check customTools or project tools — the spec
requires the tool to exist in the built-in registry.

The `customizable` flag on tool configs is NOT a spec concept. Do not gate
`--local` on this flag. Any built-in tool can be forked.

## Tool Config Loading

Always use `loadToolConfig(discovered.path)` and check `loaderResult.success`
before accessing `loaderResult.data`. Never assume a tool has a config file.

## Workspace Config Manager

`readConfig()` in `src/managers/config.ts` walks up from `process.cwd()` to
find `aikuora.workspace.yml`. It returns a `ConfigResult`.

The config shape has `name` and `scope` at the top level (not under `project`).
Update all callsites: `rootConfig.name` and `rootConfig.scope` (not `rootConfig.project.*`).

## STARTUP-001 Validation

`validateWorkspace(cwd?)` lives in `src/utils/workspace.ts`. It:

1. Calls `findConfigPath(cwd)` to locate `aikuora.workspace.yml`
2. Reads and parses the file
3. Validates `name` (required, non-empty) and `scope` (required, `/^@[a-z0-9-]+$/`)
4. Returns `{ valid: true, config }` or `{ valid: false, error: "descriptive message" }`

Error messages must name the specific invalid field, e.g.:
- "Workspace configuration is missing the required 'name' field"
- "Workspace scope '@INVALID' does not match required format /^@[a-z0-9-]+$/"

## VSCode Settings Merge

Use `mergeVscodeSettings(filePath, patch)` for `.vscode/settings.json`.
This function emits a warning to stderr for each key that already exists
with a different value, then applies the new value.

Do NOT use `mergeJsonFile` for `.vscode/settings.json` — it does not warn
on key conflicts.

## Project File Operations

Project files (`aikuora.project.yml`) use functions from `src/utils/project-file.ts`:

- `readProjectFile(dir)` — returns `ProjectFile | null`
- `writeProjectFile(dir, data)` — creates or overwrites
- `appendToolDependency(dir, toolName)` — idempotent
- `appendProjectDependency(dir, projectPath)` — idempotent

The re-link warning (spec ADD-002 side_effects) must fire in `runLink` before
calling `appendToolDependency`. Check `existing.tools.includes(toolName)` before
appending. Only warn when the tool is the top-level requested tool (not transitive).

## Tool aikuora.tool.yml Rules

- `kind` must be one of `shareable`, `root`, `none`
- `requires` lists tool names (not paths) that must be applied first
- `workspace` configures VSCode, Claude hooks, Moon tasks, and .gitignore
- `link` configures link mode (targetFile, content, variants, moonTasks)
- `scaffold` configures scaffold mode (type, devtools, packages, moonTasks, tags, cssEntry)
- `dependents` maps scaffold tool names to integration handlers

## Variant Required Error

When `link.variants` is non-empty and no variant is provided by the caller:

1. Check if any variant has `default: true`
2. If yes: use it silently
3. If no: emit error listing available variants, exit code 1

Error message format:
"Tool '<name>' requires a variant. Available variants: <v1>, <v2>, ..."
