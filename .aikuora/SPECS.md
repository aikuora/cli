# @aikuora/cli — Technical Specifications

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | >=24.0.0 (LTS, via Prototools) |
| Package manager | pnpm | >=10.0.0 (via Prototools) |
| Language | TypeScript | ^5.3.3 |
| Module format | ESM | `"type": "module"` |
| Build tool | tsup | ^8.0.2 |
| CLI framework | ink (React-based terminal UI) | ^5.0.1 |
| Argument parser | meow | ^13.2.0 |
| Templating | Handlebars | ^4.7.8 |
| Config format | YAML | yaml ^2.4.0 |
| Validation | zod | ^3.22.4 |
| Filesystem | fs-extra | ^11.2.0 |
| Testing | Vitest | ^4.0.18 |
| Linting | ESLint v9 (flat config) | ^9.39.2 |
| Formatting | Prettier | ^3.8.1 |
| Monorepo orchestrator (target) | Moonrepo | v2 |
| Version manager (target) | Prototools | - |

### Key dev dependencies

| Package | Purpose |
|---|---|
| `@ianvs/prettier-plugin-sort-imports` | Auto-sort imports by category |
| `typescript-eslint` | TypeScript ESLint unified package |
| `eslint-plugin-react`, `eslint-plugin-react-hooks` | Ink/React support in ESLint |
| `eslint-plugin-tsdoc` | API documentation linting |
| `eslint-plugin-vitest` | Test file best practices |
| `@vitest/ui` | Vitest browser UI |
| `jiti` | Runtime TypeScript for ESLint flat config |

---

## Architecture Overview

**Core principle**: Separate deterministic execution (CLI) from contextual decision-making (Claude Code). The CLI takes care of all file operations, schema validation, and tool wiring. Claude Code handles intent inference and sequencing.

### Layer diagram

```
User / Claude Code
      |
      | aikuora <command> --json
      v
  CLI Entry (src/index.tsx)
      |
      |-- Command Router (meow)
      |       |
      |       |-- init.tsx
      |       `-- add.tsx
      |
      |-- Core Layer
      |       |-- scanner.ts      (discover tools from all sources)
      |       |-- resolver.ts     (resolve tool by name with override logic)
      |       |-- loader.ts       (parse + validate aikuora.tool.yml)
      |       `-- capability.ts   (detect linkable / scaffoldable / hybrid)
      |
      |-- Managers
      |       `-- config.ts       (read/write aikuora.workspace.yml)
      |
      `-- Utils
              |-- output.ts       (dual human/JSON output)
              |-- template.ts     (Handlebars rendering + file copy)
              |-- prototools.ts   (read/update .prototools)
              |-- moon.ts         (build/write moon.yml, inherited tasks)
              |-- integration-fs.ts   (IntegrationFs runtime)
              |-- integration.ts      (handler resolution + invocation)
              `-- project-file.ts     (read/write aikuora.project.yml)
```

---

## Project Directory Structure (Source)

```
cli/
├── package.json                    # @aikuora/cli, ESM, bin: aikuora
├── tsconfig.json                   # strict, ES2022, JSX react-jsx
├── tsup.config.ts                  # build config with JSX
├── vitest.config.ts                # Node env, v8 coverage
├── eslint.config.ts                # flat config v9
├── prettier.config.mjs             # with import-sort plugin
├── .prototools                     # node: lts, pnpm: latest aliases
├── .vscode/
│   ├── settings.json               # format-on-save, YAML schemas
│   └── extensions.json             # Prettier, YAML, Moon Console
├── .claude/
│   └── settings.local.json         # Claude Code permissions + statusLine
│
├── tools/                          # Built-in tools (shipped with CLI via package.json "files")
│   ├── moon/                       # Root tool: Moonrepo (pinned to .prototools)
│   ├── node/                       # Root tool: Node.js + package.json + toolchains.yml
│   ├── pnpm/                       # Root tool: pnpm + pnpm-workspace.yaml
│   ├── prettier/                   # Shareable: formatter
│   ├── eslint/                     # Shareable: linter (typescript + nextjs variants)
│   ├── tsconfig/                   # Shareable: TypeScript config (typescript + nextjs variants)
│   └── nextjs/                     # Scaffoldable: Next.js app → apps/
│
├── templates/
│   └── init/                       # Template for `aikuora init`
│       ├── .moon/workspace.yml
│       ├── .prototools.template
│       ├── .gitignore.template
│       ├── .claude/settings.local.json.template
│       ├── .vscode/settings.json
│       ├── .vscode/extensions.json
│       ├── aikuora.workspace.yml.hbs
│       └── README.md.hbs
│
└── src/
    ├── index.tsx                   # CLI entry: parse args, route to command
    ├── commands/
    │   ├── init.tsx                # Initialize monorepo from scratch
    │   └── add.tsx                 # Unified add (scaffold + link + fork + project dep)
    ├── core/
    │   ├── scanner.ts              # Filesystem scanner: discover tools from all sources
    │   ├── scanner.test.ts
    │   ├── resolver.ts             # Resolve tool by name (built-in → project → custom)
    │   ├── resolver.test.ts
    │   ├── loader.ts               # Load & validate aikuora.tool.yml per tool
    │   ├── loader.test.ts
    │   ├── capability.ts           # Detect capabilities from filesystem
    │   └── capability.test.ts
    ├── managers/
    │   └── config.ts               # Read/update aikuora.workspace.yml
    ├── types/
    │   ├── config.ts               # Workspace config schema + types
    │   ├── tool-config.ts          # Tool config schema + types (aikuora.tool.yml)
    │   ├── project.ts              # Project manifest schema + types (aikuora.project.yml)
    │   ├── integration.ts          # IntegrationHandler API (public SDK contract)
    │   └── tool.ts                 # DiscoveredTool, ToolMap, ToolCapabilities
    └── utils/
        ├── output.ts               # Dual output (human/JSON)
        ├── template.ts             # Handlebars rendering + file copy
        ├── prototools.ts           # Read/update .prototools
        ├── moon.ts                 # Build/write moon.yml + addInheritedMoonTasks
        ├── integration-fs.ts       # IntegrationFs runtime implementation
        ├── integration.ts          # Integration handler resolution + invocation
        └── project-file.ts         # Read/write aikuora.project.yml
```

---

## Tool Model

**Everything is a tool.** There is no distinction between a "devtool" and a "scaffold template". Capabilities are auto-detected from the filesystem:

| Has `template/` (singular) | Has `templates/` (plural) | Capability |
|---|---|---|
| Yes | No | Linkable — shareable config (e.g. prettier, eslint) |
| No | Yes | Scaffoldable — creates apps/packages/modules (e.g. nextjs) |
| Yes | Yes | Hybrid — both (e.g. tsconfig) |

**No hardcoded registry.** The CLI scans tool directories and reads each `aikuora.tool.yml` to understand what the tool offers.

### Tool Resolution Order

1. Built-in tools — `node_modules/@aikuora/cli/tools/`
2. Project tools — `tools/` in the monorepo root
3. Custom paths — declared in `aikuora.workspace.yml` under `customTools`

Project tools override built-ins with the same name. Custom paths override project tools.

### Tool Directory Anatomy

```
tools/<name>/
├── aikuora.tool.yml            # Required: tool metadata + capabilities
├── template/                   # Optional: shareable config content (linkable)
│   ├── index.mjs               # or index.json, base.json, etc.
│   └── package.json            # deps merged into packages/configs/package.json
├── templates/                  # Optional: Handlebars project templates (scaffoldable)
│   ├── package.json.hbs
│   └── src/...
└── dependents/                 # Optional: integration handlers for consuming projects
    ├── nextjs.ts               # IntegrationHandler for nextjs target
    └── expo.ts                 # IntegrationHandler for expo target
```

---

## Config File System (Three Files)

| File | Location | Scope | Owner |
|---|---|---|---|
| `aikuora.workspace.yml` | Monorepo root | Project name, scope, structure, runtime defaults | User + CLI (`init`) |
| `aikuora.tool.yml` | `tools/<name>/` | Tool capabilities, link config, scaffold config, integration handlers | Tool author |
| `aikuora.project.yml` | `apps/<n>/`, `packages/<n>/`, `modules/<n>/` | Scaffold tool used, project type, linked devtools, project dependencies | CLI (auto-written) |

### `aikuora.workspace.yml` schema

```yaml
project:
  name: 'my-project'
  scope: '@my-project'         # npm scope for internal packages

structure:
  apps: 'apps'
  packages: 'packages'
  modules: 'modules'
  tools: 'tools'

defaults:
  node: 'lts'                  # Resolved at runtime by proto
  pnpm: 'latest'
  python: '3.12.x'
  uv: 'latest'

customTools:
  - './my-custom-tools/my-scaffold'
```

### `aikuora.tool.yml` schema (key fields)

```yaml
name: prettier
kind: shareable | root | none     # default: none
lang: typescript | python
customizable: false               # allow --local fork; default: false

# Root tool fields (kind: root only)
installer: proto
version: latest
requires: [node]                  # tools set up first (recursive)

# Workspace-level integrations (idempotent)
workspace:
  vscode:
    extensions: [esbenp.prettier-vscode]
    settings:
      "[typescript]":
        editor.defaultFormatter: "esbenp.prettier-vscode"
  claude:
    hooks:
      PostFileWrite:
        - matcher: "*.{js,jsx,ts,tsx,mjs,cjs,json,md}"
          command: 'pnpm exec prettier --write "$FILE"'
  moon:
    file: typescript              # writes to .moon/tasks/typescript.yml
    tasks:
      - name: format
        command: prettier
        args: ['--write', '.']
        options:
          cache: false

# Linking config (tools with template/)
link:
  dependency: true                # add @scope/configs to target devDependencies
  targetFile: 'prettier.config.mjs'
  content: "export { default } from '{{packageName}}';\n"
  variants:
    - name: nextjs
      forTools: [nextjs]          # auto-select when target is a nextjs project
      content: "..."              # per-variant content override

# Scaffold config (tools with templates/)
scaffold:
  type: app | package | module
  devtools:
    - prettier
    - tool: eslint
      variant: nextjs             # explicit variant selection
  moonTasks:
    - name: dev
      command: next dev
      args: ['--turbopack']
```

### `aikuora.project.yml` schema

```yaml
tool: nextjs                      # scaffold tool that created this project
type: app | package | module

dependencies:
  tools:                          # devtools linked to this project
    - prettier
    - eslint
    - tsconfig
  projects:                       # workspace packages this project consumes
    - packages/ui
```

---

## Data Types (TypeScript)

### `TemplateContext` (Handlebars variables)

```typescript
interface TemplateContext {
  name: string;        // "dashboard"
  scope: string;       // "@my-project"
  scopedName: string;  // "@my-project/dashboard"
  type: string;        // "app" | "package" | "module"
  tool: string;        // "nextjs"
  dir: string;         // "apps/dashboard"
  linkedTools: string[];
  variant?: string;
  year: number;
}
```

### `IntegrationHandler` contract

```typescript
export type IntegrationHandler = (ctx: IntegrationContext) => Promise<void>;

interface IntegrationContext {
  target: { path: string; tool: string; scopedName: string };
  source: { path: string; tool: string; scopedName: string };
  fs: IntegrationFs;
}

interface IntegrationFs {
  insertAfterLine(file: string, pattern: RegExp, content: string): Promise<void>;
  insertBeforeLine(file: string, pattern: RegExp, content: string): Promise<void>;
  mergeJson(file: string, data: Record<string, unknown>): Promise<void>;
  appendToFile(file: string, content: string): Promise<void>;
}
```

---

## CLI Commands Reference

```bash
aikuora init --name <n> [--scope <s>] [--json]
aikuora add <tool> --name <n> [--json]          # scaffold
aikuora add <tool> <target> [--variant <v>] [--json]   # link
aikuora add <tool> --local [--json]              # fork built-in
aikuora add <package-path> <target> [--json]    # project dependency
aikuora sync [--json]
aikuora info [--json]
aikuora list tools [--json]
aikuora list apps|packages|modules [--json]
```

All commands accept `--json` for machine-readable output (used by Claude Code).

### JSON Output Shape (examples)

```jsonc
// init
{ "action": "init", "success": true, "name": "my-project", "scope": "@my-project", "projectRoot": "/path" }

// add scaffold
{ "action": "add", "mode": "scaffold", "success": true, "tool": "nextjs", "name": "dashboard",
  "path": "apps/dashboard", "linkedTools": ["prettier", "eslint", "tsconfig"],
  "moonTasksCreated": ["dev", "build", "start"] }

// add link
{ "action": "add", "mode": "link", "success": true, "tool": "prettier",
  "target": "apps/dashboard", "configFile": "prettier.config.mjs", "variant": null, "moonTaskAdded": true }

// add project dep
{ "action": "add", "mode": "project", "success": true, "source": "packages/ui",
  "target": "apps/dashboard", "scopedName": "@my-project/ui", "handlerInvoked": true }
```

---

## `packages/configs/` — Consolidated Shareable Package

Instead of creating one npm package per shareable tool (e.g. `@scope/prettier-config`, `@scope/eslint-config`), all TypeScript shareable tools contribute to a single `packages/configs/` package.

**Package structure:**
```
packages/configs/
  package.json      # name: "@scope/configs", exports: { "./*": "./src/*/index.mjs" }
  src/
    prettier/
      index.mjs
    eslint/
      index.mjs     # (or index.ts compiled to .mjs)
    tsconfig/
      base.json
      nextjs.json
```

**Export pattern constraint:** Node.js only allows one `*` per export pattern. The CLI generates per-tool patterns:
- `"./prettier"` → `"./src/prettier/index.mjs"` (single file)
- `"./eslint/*"` → `"./src/eslint/*.mjs"` (variants)
- `"./tsconfig/*.json"` → `"./src/tsconfig/*.json"` (JSON variants)

**Consumer usage:**
```js
import config from "@scope/configs/prettier";
import { rules } from "@scope/configs/eslint/nextjs";
```

---

## Moon Task Inheritance

Shareable tools write tasks to `.moon/tasks/<lang>.yml` instead of each project's `moon.yml`. Moon automatically inherits these tasks to all projects with the matching `language` field in their `moon.yml`.

```yaml
# .moon/tasks/typescript.yml (written by CLI, never manually)
$schema: 'https://moonrepo.dev/schemas/tasks.json'
tasks:
  format:
    command: prettier
    args: ['--write', '.']
    options:
      cache: false
  format-check:
    command: prettier
    args: ['--check', '.']
  lint:
    command: eslint
    args: ['.']
  typecheck:
    command: tsc
    args: ['--noEmit']
```

Projects with `language: typescript` in their `moon.yml` automatically inherit all these tasks. The `language` field is written by the CLI when scaffolding with a `lang: typescript` tool (e.g. nextjs).

---

## Development Setup

```bash
# Install dependencies
pnpm install

# Development mode (watch + rebuild on change)
pnpm dev

# Build
pnpm build

# Type check
pnpm typecheck

# Test (watch mode)
pnpm test

# Test (single run)
pnpm test:run

# Test with coverage
pnpm test:coverage

# Lint
pnpm lint
pnpm lint:fix

# Format
pnpm format
pnpm format:check
```

### Local testing with global symlink

```bash
pnpm build
pnpm link --global
aikuora init --name my-project   # now available globally

# To unlink
pnpm unlink --global
```

---

## Known Gotchas & Edge Cases

- **`getBuiltInToolsPath()` context detection**: distinguishes between `dist/` (production) and `src/core/` (development) by checking the parent directory name. Must be updated if directory structure changes.
- **`.prototools` blank line fix**: each insertion previously appended a new blank separator line before `[settings]`. Fixed by walking back past existing blank lines and replacing them with exactly one separator. `reformatPrototools()` should be called after every `proto pin` invocation.
- **Root tool scanner fix**: `scanToolDirectory` includes any directory with `aikuora.tool.yml` even without `template/` or `templates/`. Root-only tools like `moon` were previously invisible to `resolveTool()`.
- **`skipExisting` on root tools**: `renderAndCopy` and `copyDirectory` support `{ skipExisting: true }` to prevent overwriting user-modified files on re-runs. Root tools always use this.
- **Moon v2 breaking changes**: `vcs.client` → `vcs.manager`, `toolchains.yml` (with `javascript` section), double-quoted YAML strings required throughout. Keep in sync as Moon evolves.
- **Brand-agnostic code convention**: all internal identifiers must use generic names (`Config`, not `AikuoraConfig`, `ToolScanner` not `AikuoraToolScanner`). Comments explain WHY, not WHAT. This is intentional for future renaming.
- **`runLink` workspace fix**: `runLink` was only handling Moon tasks manually. It now calls `applyWorkspaceSettings()` for all workspace integrations (vscode settings, extensions, claude hooks, moon tasks).
- **`ensureRootPeerDeps()`**: propagates `peerDependencies` from tool `template/package.json` to root workspace `package.json` devDependencies (new keys only, idempotent). Without this, consumers would need to install tool peer deps manually.

---

## Claude Code Configuration (`.claude/settings.local.json`)

Allowed permissions for this project:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm remove:*)",
      "Bash(proto install:*)",
      "Bash(pnpm add:*)",
      "Bash(pnpm install:*)",
      "Bash(pnpm build:*)",
      "Bash(node:*)",
      "Bash(pnpm --version:*)",
      "Bash(proto use:*)",
      "Bash(pnpm format:*)",
      "Bash(pnpm typecheck:*)",
      "Bash(pnpm test:run:*)",
      "Bash(pnpm lint:*)",
      "WebFetch(domain:moonrepo.dev)",
      "WebFetch(domain:github.com)",
      "WebFetch(domain:pnpm.io)",
      "WebFetch(domain:raw.githubusercontent.com)"
    ]
  }
}
```
