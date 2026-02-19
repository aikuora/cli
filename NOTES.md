# Implementation Notes

This document tracks implementation decisions and progress for the aikuora CLI project.

## Global Guidelines

### Code Quality & Conventions

**Brand-agnostic code**:

- ❌ Do NOT use brand names (Aikuora, aikuora) in code identifiers
- ✅ Use generic, descriptive names (Config, ToolConfig, etc.)
- **Rationale**: If the project is renamed, we don't want to refactor all the code
- **Examples**:
  - ❌ `AikuoraConfig` → ✅ `Config`
  - ❌ `AikuoraToolScanner` → ✅ `ToolScanner`
  - ❌ `aikuoraConfigSchema` → ✅ `configSchema`

**Code comments**:

- Only comment WHY, not WHAT (code should be self-documenting)
- Don't add internal decision comments (e.g., "brand-agnostic naming")
- Comment complex logic, edge cases, or non-obvious behavior
- Keep comments concise and relevant

**Other conventions**:

- Use Prettier for consistent formatting
- Prefer descriptive names over abbreviations
- Keep functions focused and single-purpose
- Use zod for runtime validation

---

## Phase 1: CLI Core + Scanner

### 1.1 Project setup: package.json, tsconfig, tsup

**Status**: ✅ Completed

**Decisions**:

- Package name: `@aikuora/cli`
- Initial version: `0.1.0`
- Module type: ESM (`"type": "module"`)
- Build tool: `tsup` for fast TypeScript bundling
- CLI framework: `ink` (React-based interactive CLI framework)
- Argument parsing: `meow` (simple CLI argument parser, works well with ink)
- Output format: ESM only (`.js`)
- Binary name: `aikuora`
- Version management: `prototools` (manages Node.js and pnpm versions)

**Dependencies chosen**:

- `ink`: React-based CLI framework for building interactive terminal UIs
- `react`: Required peer dependency for ink
- `meow`: CLI argument parsing
- `handlebars`: Template rendering engine
- `yaml`: YAML parsing for config files
- `fs-extra`: Enhanced filesystem operations
- `zod`: Runtime schema validation for configs

**Dev Dependencies**:

- `typescript`: TypeScript compiler
- `tsup`: Build tool
- `@types/node`: Node.js type definitions
- `@types/fs-extra`: fs-extra type definitions
- `@types/react`: React type definitions for ink
- `prettier`: Code formatter
- `@ianvs/prettier-plugin-sort-imports`: Auto-sort imports by category

**Files created**:

- `.prototools`: Version aliases for Node.js ("lts") and pnpm ("latest"), resolved at runtime
- `package.json`: Package configuration with ESM module type, engines field synced with prototools
- `tsconfig.json`: TypeScript compiler configuration (strict mode, ES2022 target, JSX support)
- `tsup.config.ts`: Build configuration for tsup with JSX transformation
- `.gitignore`: Git ignore patterns (excludes .vscode/ to share team settings)
- `prettier.config.mjs`: Prettier configuration with import sorting
- `.vscode/extensions.json`: VS Code extension recommendations (Prettier)
- `.vscode/settings.json`: VS Code workspace settings (format on save)
- `src/index.tsx`: CLI entry point using ink + meow (React components)
- `README.md`: Project documentation

**Directory structure**:

- `src/commands/`: Command implementations (to be populated)
- `src/core/`: Core functionality (scanner, resolver, loader, capability)
- `src/generators/`: Code generation utilities
- `src/managers/`: Config and workspace managers
- `src/utils/`: Helper utilities
- `tools/`: Built-in tools directory (to be populated)

**Technology changes**:

- ✅ Replaced `citty` + `chalk` with `ink` (React-based CLI framework) + `meow` (argument parser)
- ✅ Added `.prototools` file to manage Node.js and pnpm versions
- ✅ Configured to use Node.js "lts" and pnpm "latest" (resolved at runtime, not pinned)
- ✅ Used `proto pin node lts` and `proto pin pnpm latest` without --resolve flag
- ✅ Configured JSX support in tsconfig.json and tsup.config.ts
- ✅ Renamed entry point to `index.tsx` for proper JSX handling

**Prototools approach**:

- Versions use aliases ("lts", "latest") that resolve at runtime
- This ensures the project always uses the current LTS and latest stable versions
- No need to update .prototools when new versions are released
- Command: `proto pin <tool> <alias>` (without --resolve)

**Verification**:

- ✅ Prototools resolves "lts" to Node 24.13.1 and "latest" to pnpm 10.29.3 at runtime
- ✅ .prototools contains aliases, not specific versions
- ✅ Dependencies installed successfully
- ✅ TypeScript compilation passes with JSX support
- ✅ CLI builds and executes with ink rendering on Node LTS
- ✅ Help command displays properly formatted output
- ✅ Unimplemented commands show appropriate messages

**Prettier setup**:

- ✅ Installed `prettier` and `@ianvs/prettier-plugin-sort-imports`
- ✅ Created `prettier.config.mjs` with import sorting configuration
- ✅ Created `.vscode/extensions.json` recommending Prettier extension
- ✅ Created `.vscode/settings.json` with format-on-save enabled
- ✅ Added `format` and `format:check` scripts to package.json
- ✅ Formatted all existing files with Prettier
- ✅ Updated `.gitignore` to commit `.vscode/` directory for team consistency

**Decision: VS Code Settings in Git**:

- The `.vscode/` directory is now tracked in git (removed from `.gitignore`)
- **Rationale**: Share editor configuration across the team for consistent development experience
- **Contains**: Editor settings (format on save, default formatter) and extension recommendations
- **Benefit**: New team members automatically get recommended extensions and proper formatting setup

**Dev tooling setup (ESLint + Vitest)**:

**ESLint configuration**:

- ✅ Flat config format (`eslint.config.ts`) with ESLint 9
- ✅ TypeScript ESLint with recommended rules
- ✅ React/Ink support (eslint-plugin-react, eslint-plugin-react-hooks)
- ✅ TSDoc plugin for API documentation (`tsdoc/syntax`: warn)
- ✅ Vitest plugin for test file best practices
- ✅ Custom rules enabled:
  - `@typescript-eslint/consistent-type-imports`: error (enforces `import type`)
  - `@typescript-eslint/consistent-type-exports`: error (enforces `export type`)
- ✅ Config files (`*.config.ts`) excluded from type-aware linting
- ✅ Scripts: `lint`, `lint:fix`

**Vitest configuration**:

- ✅ Test framework configured with Node environment
- ✅ Coverage provider: v8
- ✅ Coverage formats: text, json, html
- ✅ Test file patterns: `**/*.test.ts`, `**/*.test.tsx`
- ✅ Scripts: `test` (watch), `test:run` (once), `test:ui` (UI), `test:coverage`
- ✅ Sample test created for config manager (4 tests passing)

**Dependencies installed**:

- `eslint@9.39.2` (v9 for plugin compatibility)
- `typescript-eslint@8.55.0` (unified TypeScript ESLint package)
- `eslint-plugin-react`, `eslint-plugin-react-hooks` (Ink support)
- `eslint-plugin-tsdoc` (API documentation)
- `eslint-plugin-vitest` (test best practices)
- `vitest@4.0.18`, `@vitest/ui` (testing framework)

**Next steps**: Phase 1.2 - Config manager

---

### 1.2 Config manager: read/write root `aikuora.config.yaml`

**Status**: ✅ Completed

**Goal**: Create a config manager to read and write the root `aikuora.config.yaml` file with runtime validation using zod.

**Files created**:

- `src/types/config.ts`: Zod schemas and TypeScript types (brand-agnostic naming)
  - `projectConfigSchema`: Validates project name and npm scope
  - `structureConfigSchema`: Validates directory structure (apps, packages, modules, tools)
  - `defaultsConfigSchema`: Validates default runtime versions (node, pnpm, python, uv)
  - `configSchema`: Complete config schema with defaults
  - TypeScript types: `ProjectConfig`, `StructureConfig`, `DefaultsConfig`, `Config`
- `src/managers/config.ts`: Config manager implementation
  - `findConfigPath()`: Walk up directory tree to find config file
  - `readConfig()`: Read, parse, and validate YAML config
  - `writeConfig()`: Validate and write config to YAML
  - `createDefaultConfig()`: Generate default config with sensible defaults
  - `formatValidationError()`: Pretty-print zod validation errors

**Features implemented**:

- ✅ Zod schema validation with helpful error messages
- ✅ Automatic config file discovery (walks up from cwd)
- ✅ Safe parsing with detailed error types (not_found, invalid_yaml, validation_error, write_error)
- ✅ Default values for all optional fields
- ✅ Type-safe config object (TypeScript types from zod)
- ✅ YAML formatting with proper indentation

**Validation rules**:

- Project name: required, non-empty string
- Scope: optional, must match npm scope format (@scope-name)
- Structure: all fields default to standard names
- Defaults: all fields have sensible defaults (lts, latest, etc.)
- Custom tools: array of file paths, defaults to empty

**Testing**:

- ✅ Created test script to verify functionality
- ✅ Verified reading existing config
- ✅ Verified creating default config
- ✅ Verified writing config to file
- ✅ All tests passed successfully

**Refactoring (brand-agnostic code)**:

- ✅ Removed "Aikuora" prefix from all types and schemas
- ✅ `AikuoraConfig` → `Config`
- ✅ `AikuoraConfigSchema` → `configSchema`
- ✅ All schemas use camelCase (projectConfigSchema, structureConfigSchema, etc.)
- ✅ Updated comments to be brand-agnostic
- ✅ Removed test file from tsup.config.ts entry

---

### 1.3 Tool scanner: discover tools from built-in + project + custom paths

**Status**: ✅ Completed

**Goal**: Implement a tool scanner that discovers tools from multiple sources and detects their capabilities.

**Files created**:

- `src/types/tool.ts`: Tool types and interfaces
  - `ToolCapabilities`, `ToolSource`, `DiscoveredTool`, `ToolMap`
- `src/core/capability.ts`: Capability detection (7 tests)
  - `detectCapabilities()`, `isHybrid()`, `describeCapabilities()`
- `src/core/scanner.ts`: Tool discovery and scanning (4 tests)
  - `scanAllTools()`, `groupToolsByCapability()`, etc.
- `src/core/resolver.ts`: Tool resolution (9 tests)
  - `resolveTool()`, `toolExists()`, `getToolNames()`, `filterToolsBySource()`

**Features implemented**:

- ✅ Filesystem-based capability detection (no hardcoded registry)
- ✅ Multi-source tool discovery with override logic (custom \> project \> built-in)
- ✅ Built-in tools path resolution (works in dev and production)
- ✅ Tool grouping and filtering utilities
- ✅ All 24 tests passing

---

### 1.4 Tool loader: parse and validate per-tool `aikuora.config.yaml`

**Status**: In Progress

**Goal**: Create a loader that reads and validates per-tool configuration files.

**Status**: ✅ Completed

**Files created**:

- `src/types/tool-config.ts`: Zod schemas for per-tool config
  - `toolMetadataSchema`: Tool name, description, authors, version
  - `linkableConfigSchema`: Variants and linking instructions
  - `scaffoldableConfigSchema`: Template variables and post-scaffold hooks
  - `toolConfigSchema`: Complete per-tool config schema
- `src/core/loader.ts`: Tool config loader
  - `loadToolConfig()`: Load and validate tool config from YAML
  - `hasToolConfig()`: Check if tool has a config file

**Features implemented**:

- ✅ Per-tool config validation with zod
- ✅ Support for linkable and scaffoldable configurations
- ✅ Error handling (not_found, invalid_yaml, validation_error)
- ✅ Default values for optional fields
- ✅ 5 tests passing for config validation

---

### 1.5 Capability detector: linkable/scaffoldable/hybrid

**Status**: Not Started

---

### 1.6 `init` command

**Status**: ✅ Completed

**Goal**: Implement the `init` command to initialize a new monorepo from scratch.

**Files created**:

- `src/commands/init.tsx`: Init command (refactored to use templates)
  - `initCommand()`: Copies template and runs setup
  - `InitCommand`: Ink component for UI feedback
- `src/utils/template.ts`: Template utility
  - `copyTemplate()`: Copy template directory with Handlebars rendering
  - `getTemplatesPath()`: Get path to templates directory
- `templates/init/`: Language-agnostic init template
  - `.moon/workspace.yml`: Moon workspace configuration
  - `.prototools.template`: Proto version management (with auto-install/auto-clean)
  - `.gitignore.template`: Git ignore patterns
  - `.claude/settings.local.json.template`: Claude Code configuration
  - `.vscode/settings.json`: VS Code settings (Prettier + Moon YAML schemas)
  - `.vscode/extensions.json`: Extensions (Prettier, YAML, Moon Console)
  - `aikuora.config.yaml.hbs`: Project config (Handlebars template)
  - `README.md.hbs`: Project README (Handlebars template)
  - `.gitkeep` files in apps/, packages/, modules/, scripts/

**Refactoring**:

- ✅ Moved all hardcoded files to `templates/init/` directory
- ✅ Uses Handlebars for templating (`.hbs` files)
- ✅ Dotfiles renamed to `.template` extension for clarity and safety
- ✅ Template includes Claude Code and VS Code configuration
- ✅ VS Code YAML schemas for Moon config files
- ✅ **Fully language-agnostic** - no pnpm, npm, or Node.js specific files
- ✅ Removed automatic `proto install` and `pnpm install`
- ✅ Removed `pnpm-workspace.yaml` (should be added by pnpm tool)
- ✅ Much more maintainable - edit templates, not code
- ✅ Added `scripts/` directory from bash script
- ✅ Includes `templates` in package.json files field
- ✅ Added `.prettierignore` to skip template files

**Command usage**:

```bash
aikuora init --name my-project --scope @my-scope
```

---

### 1.7 Dual output (human + JSON)

**Status**: ✅ Completed

**Decisions**:

- All commands support `--json` flag for machine-readable output
- Human-readable output (default): Uses emojis, colors, and formatted text
- JSON output (`--json`): Structured data for programmatic consumption
- Output utilities centralized in `src/utils/output.ts`

**Implementation**:

- `output()`: Outputs JSON when `--json` flag is set
- `outputSuccess()`: Human-readable success messages (skipped in JSON mode)
- `outputError()`: Human-readable error messages (skipped in JSON mode)
- `outputInfo()`: Human-readable info messages (skipped in JSON mode)

**JSON output format for init command**:

```json
{
  "action": "init",
  "success": true,
  "name": "project-name",
  "scope": "@scope",
  "projectRoot": "/path/to/project"
}
```

On error:

```json
{
  "action": "init",
  "success": false,
  "name": "project-name",
  "scope": "@scope",
  "error": "error message"
}
```

**Command usage**:

```bash
# Human-readable (default)
aikuora init --name my-project --scope @my-scope

# Machine-readable JSON
aikuora init --name my-project --scope @my-scope --json
```

**Files created**:

- `src/utils/output.ts`: Dual output utilities

**Files modified**:

- `src/commands/init.tsx`: Added JSON output support
- `src/index.tsx`: Pass `--json` flag to commands, suppress UI in JSON mode

---

## Phase 2: `add` Command (unified)

**Status**: In Progress

---

### 2.1 Unified `add` command

**Status**: ✅ Completed

**Decisions**:

- `scaffold`, `link`, and `add-tool` are collapsed into a single `add` command
- Mode is auto-detected from flags and positional arguments:
  - `--name <n>` → scaffold mode
  - Second positional arg (target path) → link mode
  - `--local` flag → local fork mode (requires `customizable: true` in tool config)

**Files created**:

- `src/commands/add.tsx`: Add command with three modes
- `src/utils/prototools.ts`: Read/update `.prototools` files
- `src/utils/moon.ts`: Build/write/update `moon.yml` files

**Files modified**:

- `src/index.tsx`: Registered `add` command, updated help text, added `--local` flag

---

### 2.2 Three-file config system

**Status**: ✅ Completed

**Decision**: Split `aikuora.config.yaml` into three distinct files with clear, non-overlapping responsibilities.

| File | Scope | Owner |
|------|-------|-------|
| `aikuora.workspace.yml` | Monorepo root — project name, scope, structure, defaults | User + CLI (`init`) |
| `aikuora.tool.yml` | Per-tool — capabilities, templates, link config, dependents | Tool author |
| `aikuora.project.yml` | Per-project — scaffold tool, type, linked tools, project deps | CLI (written automatically) |

**Rationale**: The old `aikuora.config.yaml` was used for both workspace and tool config, creating ambiguity. Explicit file names make each file's role immediately clear.

**Constants updated**:

- `src/managers/config.ts`: `CONFIG_FILENAME = 'aikuora.workspace.yml'`
- `src/core/loader.ts`: `TOOL_CONFIG_FILENAME = 'aikuora.tool.yml'`
- `templates/init/aikuora.workspace.yml.hbs`: renamed from `aikuora.config.yaml.hbs`

---

### 2.3 `aikuora.project.yml` — per-project dependency manifest

**Status**: ✅ Completed

**Purpose**: Each app/package/module declares what it depends on so the CLI can reason about the dependency graph, drive reactivity, and support `aikuora sync`.

```yaml
# apps/dashboard/aikuora.project.yml
tool: nextjs
type: app
dependencies:
  tools:
    - prettier
    - eslint
  projects:
    - packages/ui
```

**Files created**:

- `src/types/project.ts`: Zod schema (`projectFileSchema`) and TypeScript types

**Implemented**:

- Written automatically after `aikuora add <tool> --name` (scaffold mode)
- Appended automatically after `aikuora add <tool> <target>` (link mode via `appendToolDependency`)

---

### 2.4 Integration handler system — `dependents/`

**Status**: ✅ Completed

**Concept**: When a project (e.g. `apps/dashboard`) declares a dependency on a workspace package (e.g. `packages/ui`), the CLI needs to know how to wire them together. The `packages/ui` tool's `aikuora.tool.yml` declares handlers for each scaffold type it can integrate with:

```yaml
# packages/ui's aikuora.tool.yml (the shadcn tool that scaffolded it)
dependents:
  nextjs: nextjs.ts
  expo: expo.ts
```

Each handler is a TypeScript file under `tools/<tool>/dependents/` that implements the `IntegrationHandler` contract:

```typescript
// tools/shadcn/dependents/nextjs.ts
import type { IntegrationHandler } from '../src/types/integration.js';

export const integrate: IntegrationHandler = async ({ target, source, fs }) => {
  await fs.insertAfterLine(
    `${target.path}/src/app/globals.css`,
    /^@tailwind/,
    `@import "${source.scopedName}/styles/globals.css";`
  );
};
```

**Design principle**: The knowledge of how to integrate lives in the tool (package provider), not in the consuming project. The CLI is the executor.

**Files created**:

- `src/types/integration.ts`: `IntegrationContext`, `IntegrationFs`, `IntegrationHandler`
- `src/utils/integration-fs.ts`: Runtime implementation of `IntegrationFs`
- `src/utils/project-file.ts`: Read/write `aikuora.project.yml` (`appendToolDependency`, etc.)

**Implemented**:

- Handler resolution: given `target.tool`, finds the right `dependents/<tool>.ts` and invokes `integrate()` via `invokeIntegrationHandler`
- Future: publish types as `@aikuora/sdk` for third-party tool authors

---

## Phase 3: Built-in Tools

**Status**: In Progress

---

### 3.1 Tool deployment: `kind` field

**Status**: ✅ Completed

**Decision**: Added a `kind` enum to `aikuora.tool.yml` to control how a tool's shareable config is deployed at the workspace level.

| Value | Behavior |
|-------|----------|
| `shareable` | Creates/updates the consolidated `packages/configs/` package. Tool content goes to `packages/configs/src/<name>/`. Applies `workspace` settings (vscode, claude, moon). |
| `root` | Creates config at workspace root. Not yet implemented. |
| `none` | Default. Existing scaffold/link behavior — no shared package created. |

The `kind` field is optional and defaults to `none`, making it backward-compatible with all existing tool definitions.

---

### 3.2 Consolidated `packages/configs/` package

**Status**: ✅ Completed

**Decision**: Instead of creating individual npm packages per tool (e.g., `@scope/prettier-config`, `@scope/eslint-config`), all TypeScript shareable tools contribute to a single `packages/configs/` package.

**Rationale**: One package with wildcard exports is simpler to consume (`@scope/configs/prettier`, `@scope/configs/eslint`) and avoids managing multiple internal package versions. New tools are added by dropping a directory — no new package.json at the package level.

**Package structure**:

```
packages/configs/
  package.json      # name: "@scope/configs", exports: { "./*": "./src/*/index.mjs" }
  src/
    prettier/
      index.mjs     # prettier config
    eslint/
      index.mjs     # eslint config
```

**`package.json` exports field**:

```json
{
  "name": "@scope/configs",
  "exports": {
    "./*": "./src/*/index.mjs"
  }
}
```

**Dependency merging**: Each tool's `template/package.json` declares its own dependencies. When `runShareable` runs, it deep-merges these into `packages/configs/package.json` (auto-merge, new keys only — existing values are never overwritten).

**Consumer usage**:

```js
import config from "@scope/configs/prettier";
import { rules } from "@scope/configs/eslint";
```

---

### 3.3 `template/` directory (renamed from `configs/`)

**Status**: ✅ Completed

**Decision**: The `configs/` directory inside a tool has been renamed to `template/` (singular). The `templates/` directory (plural) retains its meaning for Handlebars scaffolding.

| Directory | Capability | Description |
|-----------|-----------|-------------|
| `template/` | `linkable: true` | Shareable config content. Goes to `packages/configs/src/<name>/` for `kind: shareable` tools, or linked directly for `kind: none`. |
| `templates/` | `scaffoldable: true` | Handlebars project templates for `aikuora add <tool> --name`. |

**Rationale**: `template/` (singular) makes it unambiguous that this is the single source-of-truth config, not a collection of project templates. The rename also prevents confusion when exploring the tool directory.

**Capability detection updated** in `src/core/capability.ts`:

```typescript
export function detectCapabilities(toolDir: string): ToolCapabilities {
  return {
    linkable: existsSync(join(toolDir, "template")),   // singular
    scaffoldable: existsSync(join(toolDir, "templates")), // plural
  };
}
```

---

### 3.4 `workspace` config in `aikuora.tool.yml`

**Status**: ✅ Completed

**Decision**: Tools declare workspace-level integrations in a `workspace` block. These are applied once when the tool is installed via `aikuora add <tool>` (shareable mode) and are idempotent — running the command again does not duplicate entries.

**Three sub-configs**:

**`vscode`**: Merges into `.vscode/settings.json` and `.vscode/extensions.json`.

```yaml
workspace:
  vscode:
    extensions:
      - esbenp.prettier-vscode
    settings:
      editor.defaultFormatter: "esbenp.prettier-vscode"
      editor.formatOnSave: true
```

- `vscode.settings`: Deep-merged into `.vscode/settings.json` (existing keys preserved)
- `vscode.extensions`: Appended to `.vscode/extensions.json` recommendations list (deduplicates)

**`claude`**: Merges hooks into `.claude/settings.json`.

```yaml
workspace:
  claude:
    hooks:
      PostFileWrite:
        - matcher: "*.{js,jsx,ts,tsx,mjs,cjs,json,md,css,scss,yaml,yml}"
          command: 'pnpm exec prettier --write "$FILE"'
```

- Hooks are deduplicated by `command` string — adding the same tool twice does not create duplicate hooks.

**`moon`**: Writes tasks to `.moon/tasks/<file>.yml` using Moon's task inheritance system.

```yaml
workspace:
  moon:
    file: typescript
    inheritedBy:
      toolchains:
        or: [typescript]
    tasks:
      - name: format
        command: prettier
        args: ['--write', '.']
        options:
          cache: false
      - name: format-check
        command: prettier
        args: ['--check', '.']
```

- See section 3.5 for Moon task inheritance details.

**Implementation**: `applyWorkspaceSettings()` in `src/commands/add.tsx` orchestrates all three merges. Helper functions: `mergeJsonFile()`, `mergeVscodeExtensions()`, `mergeClaudeHooks()`.

---

### 3.5 Moon task inheritance

**Status**: ✅ Completed

**Decision**: Tasks for linkable/shareable tools go to `.moon/tasks/<lang>.yml` (workspace-level inheritance file) instead of each project's `moon.yml`.

**Rationale**: Moon's `inheritedBy` system lets a single task definition propagate automatically to all matching projects. This is far more scalable than writing the same task into every `moon.yml` at link time. A single `format` task in `.moon/tasks/typescript.yml` reaches all TypeScript projects.

**How it works**:

```yaml
# .moon/tasks/typescript.yml (written by CLI)
$schema: 'https://moonrepo.dev/schemas/tasks.json'

implicitDeps: []

tasks:
  format:
    command: prettier
    args: ['--write', '.']
    options:
      cache: false
  format-check:
    command: prettier
    args: ['--check', '.']
```

Moon reads this file and applies tasks to all projects matching the `inheritedBy` selector in `aikuora.tool.yml`. The CLI only sets `inheritedBy` when creating the file for the first time — existing `inheritedBy` config is preserved on subsequent runs.

**`moonTaskSchema` extensions**: The schema now supports `args?: string[]` and `options?: { cache?: boolean }` fields to match Moon's full task format.

**`moonTasks` plural**: `linkConfig.moonTasks` (plural) replaces the old `moonTask` (singular) to allow tools to declare multiple tasks in a single config.

**Implementation**: `addInheritedMoonTasks(workspaceRoot, inheritance)` in `src/utils/moon.ts` creates or updates `.moon/tasks/<file>.yml`.

---

### 3.6 Built-in tool: `prettier` — Status: Completed

```
tools/prettier/
├── aikuora.tool.yml      # kind: shareable, requires: [pnpm], workspace config, link config
└── template/
    ├── index.mjs         # prettier config using @ianvs/prettier-plugin-sort-imports
    └── package.json      # dependencies: { "@ianvs/prettier-plugin-sort-imports" }
```

- `kind: shareable`, `requires: [pnpm]` — triggers the `pnpm → node → moon` chain
- `workspace.vscode`: language-specific formatter settings per file type (not generic `editor.defaultFormatter`)
- `workspace.claude`: PostFileWrite hook for `prettier --write "$FILE"`
- `workspace.moon`: `format` and `format-check` tasks → `.moon/tasks/typescript.yml`

New schema types: `MoonTaskOptions`, `MoonInheritance`, `ClaudeHookEntry`, `WorkspaceConfig`

New `add` modes: `runShareable` (kind: shareable), `runRoot` (kind: root)

`getBuiltInToolsPath()` fix: detects context from parent dir name (`dist/` vs `src/core/`).
`init` no longer creates `tools/` — only via `aikuora add <tool> --local`.

---

### 3.7 Built-in tool: `eslint` — Status: Completed

```
tools/eslint/
├── aikuora.tool.yml      # kind: shareable, requires: [pnpm], workspace config, link config
└── template/
    ├── index.mjs         # base eslint flat config (typescript-eslint)
    ├── nextjs.mjs        # nextjs variant (extends base + Next.js plugin)
    └── package.json      # peerDependencies: eslint, typescript-eslint, eslint-plugin-react, etc.
```

- Export pattern: `./eslint/*` → `./src/eslint/*.mjs` (multiple variants → wildcard)
- `link.variants`: `typescript` (default), `nextjs` (forTools: [nextjs] — auto-selected)
- `workspace.moon`: `lint` task → `.moon/tasks/typescript.yml`

---

### 3.8 Built-in tool: `tsconfig` — Status: Completed

```
tools/tsconfig/
├── aikuora.tool.yml      # kind: shareable, requires: [pnpm], variants: typescript + nextjs
└── template/
    ├── base.json         # base tsconfig (strict mode, ES2022)
    └── package.json
```

- Export pattern: `./tsconfig/*.json` → `./src/tsconfig/*.json`
- `link.dependency: true` — adds `@scope/configs` to target devDependencies
- `link.variants`:
  - `typescript` (default): extends `base.json`, basic outDir/rootDir
  - `nextjs` (forTools: [nextjs]): per-variant `content` override — Next.js compiler options (jsx, moduleResolution: bundler, noEmit, dom libs)
- `workspace.moon`: `typecheck` task → `.moon/tasks/typescript.yml`

**Per-variant `content` field**: when a variant declares `content`, it overrides `link.content` for that variant. Enables structurally different config files per target type from a single tool.

---

### 3.9 Built-in tool: `nextjs` — Status: Completed

```
tools/nextjs/
├── aikuora.tool.yml      # kind: none, lang: typescript, scaffold config
└── templates/
    ├── package.json.hbs  # next ^16, react 19, typescript devDeps
    ├── next.config.ts
    ├── src/app/layout.tsx.hbs
    ├── src/app/page.tsx
    └── src/app/globals.css
```

- `kind: none` — pure scaffold, no shared package
- `lang: typescript` — project `moon.yml` gets `language: typescript` enabling task inheritance
- `scaffold.devtools`: uses `{tool, variant}` entries for explicit variant selection:
  ```yaml
  devtools:
    - prettier
    - tool: eslint
      variant: nextjs
    - tool: tsconfig
      variant: nextjs
  ```
- Moon tasks: `dev --turbopack`, `build`, `start`

**`devtoolEntrySchema`**: `z.union([z.string(), z.object({ tool, variant })])` — added to schema so scaffold tools can explicitly request a specific variant when auto-linking.

---

### 3.10 Root tools: `moon`, `node`, `pnpm` — Status: Completed

**Root tool concept**: `kind: root` tools set up workspace-level infrastructure. They render `template/` to the project root (`skipExisting: true`) and pin their version to `.prototools` via `proto pin --resolve`.

**Dependency chain**: `shareable tools → pnpm → node → moon`

Each link in the chain declares `requires: [<next>]`. `ensureRequiredTools` recursively calls `runRoot` for each dependency before the current tool proceeds.

**`moon` tool** (`tools/moon/aikuora.tool.yml`):
- `kind: root`, `installer: proto`, `version: latest`
- No `template/` — only pinned to `.prototools`

**`node` tool** (`tools/node/`):
- `kind: root`, `installer: proto`, `version: lts`, `requires: [moon]`
- `template/package.json.hbs`: minimal workspace root package.json (skipExisting)
- `template/.moon/toolchains.yml.hbs`: Moon v2 toolchains with `javascript` section:
  ```yaml
  javascript:
    dedupeOnLockfileChange: true
    inferTasksFromScripts: false
    packageManager: pnpm
    syncProjectWorkspaceDependencies: true
  ```

**`pnpm` tool** (`tools/pnpm/`):
- `kind: root`, `installer: proto`, `version: latest`, `requires: [node]`
- `template/pnpm-workspace.yaml.hbs`

**`proto pin --resolve`** (`pinProtoVersion` in `src/utils/prototools.ts`):
- Skips if tool already present (idempotent)
- Calls `proto pin <tool> <version> --resolve --to local --yes` — stores real version (e.g. `22.14.0` not `lts`)
- Falls back to `updatePrototools` if proto unavailable
- `reformatPrototools()` restores blank line before `[settings]` after proto pin

**Scanner fix** (`src/core/scanner.ts`): `scanToolDirectory` now includes any directory with `aikuora.tool.yml` (not just those with `template/` or `templates/`). Root-only tools like `moon` were previously invisible to `resolveTool()`, causing silent failures.

---

### 3.11 Schema and codebase fixes — Status: Completed

**Removed `packageManager` field**: never used in any code path (Moon manages package manager via `toolchains.yml`). Removed from schema, all tool YAMLs, and tests.

**Removed `inheritedBy`**: not valid in Moon v2. Tasks in `.moon/tasks/<lang>.yml` are automatically inherited by projects with `language: <lang>` in `moon.yml`. `buildMoonConfig(tasks, language?)` now adds `$schema` and optional `language` field.

**Fixed `vcs.manager`**: was `vcs.client` in `workspace.yml.hbs` template (invalid in Moon v2).

**Double quotes in Moon YAML**: `stringify` calls in `moon.ts` use `defaultStringType: 'QUOTE_DOUBLE'`; all `.hbs` templates updated.

**Per-tool export patterns** (`buildToolExportPatterns()`): generates `./prettier`, `./eslint/*`, `./tsconfig/*.json` based on files in `template/`. Node.js exports only allow one `*` per pattern — old `"./*/*.json"` (two wildcards) was invalid.

**`configsName` vs `packageName`**: `ensureConfigsEntry` returns both. `runLink` uses `configsName` (e.g. `@scope/configs`) for `devDependencies`, not `packageName` (e.g. `@scope/configs/eslint`).

**`sortDeps()`**: sorts all `package.json` dependency keys alphabetically. Applied everywhere deps are merged.

**`ensureRootPeerDeps()`**: propagates peerDependencies from tool `template/package.json` to root workspace `package.json` devDependencies (new keys only, idempotent).

**`runLink` workspace fix**: was only handling moon tasks manually; now calls `applyWorkspaceSettings()` for all workspace integrations (vscode settings, extensions, claude hooks, moon tasks).

**`.prototools` blank line fix**: each insertion was appending a new blank separator line before `[settings]`. Fixed by walking back past existing blank lines and replacing them with exactly one separator.

**`skipExisting` option**: `renderAndCopy`/`copyDirectory` support `{ skipExisting: true }`. Root tools always use this to protect user-modified files on re-runs.

---

## Phase 4: Claude Code Plugin — Status: Not Started

---

## Phase 5: Publish — Status: Not Started
