# aikuora CLI + Claude Code Plugin — Design Document

## 1. Overview

**Problem**: Claude Code skills written in natural language for monorepo management consume too many tokens and are slow because every scaffolding, configuration, and file management operation is reasoned from scratch.

**Solution**: A compiled TypeScript CLI that encapsulates all deterministic logic (scaffolding, configuration, tool linking, prototools/moonrepo updates), combined with a Claude Code plugin that acts as a thin orchestration layer for contextual decisions.

**Architectural principle**: Separate the deterministic (CLI) from the contextual (Claude Code). The CLI executes, Claude Code decides.

---

## 2. Tech Stack

| Component                | Technology                                      |
| ------------------------ | ----------------------------------------------- |
| Monorepo orchestrator    | Moonrepo                                        |
| Runtime/tool versioning  | Prototools (single source, no nvm/pyenv/mise)   |
| CLI language             | TypeScript compiled to JS                       |
| CLI framework            | `ink` (React-based) + `meow` (argument parsing) |
| Templating engine        | Handlebars                                      |
| Package manager (JS)     | pnpm                                            |
| Package manager (Python) | uv                                              |
| Config format            | YAML (three distinct files — see section 3.5)   |

---

## 3. Core Concept: Unified Tool Model

There's no distinction between "devtool" and "scaffold template". **Everything is a tool** with capabilities the CLI auto-detects from the filesystem:

| Has `template/` | Has `templates/` | Capability                                                                  |
| --------------- | ---------------- | --------------------------------------------------------------------------- |
| ✅              | ❌               | **Linkable** — can be linked to targets (e.g. prettier, eslint)             |
| ❌              | ✅               | **Scaffoldable** — can create new apps/packages/modules (e.g. nextjs, expo) |
| ✅              | ✅               | **Hybrid** — both (e.g. tsconfig with base configs + per-target templates)  |

**No hardcoded registry**. The CLI scans tool directories and reads each tool's `aikuora.tool.yml` to understand what it offers and how to use it.

### Tool Resolution Order

The CLI resolves tools from three sources, in order:

1. **Built-in tools** — shipped inside the CLI package (`node_modules/@aikuora/cli/tools/`)
2. **Project tools** — in the monorepo's `tools/` directory
3. **Custom tool paths** — declared in the root `aikuora.workspace.yml`

Project tools override built-ins with the same name. This allows users to fork and customize any built-in tool by simply creating a `tools/<name>/` folder with their own `aikuora.tool.yml`.

### 3.5 Config File System

Three distinct YAML files, each with a clear scope:

| File | Location | Purpose |
|------|----------|---------|
| `aikuora.workspace.yml` | Monorepo root | Project name, scope, directory structure, runtime defaults |
| `aikuora.tool.yml` | `tools/<name>/` | Tool capabilities, link config, scaffold config, integration handlers |
| `aikuora.project.yml` | `apps/<n>/`, `packages/<n>/`, `modules/<n>/` | Scaffold tool used, project type, tool and project dependencies |

---

## 4. Tool Anatomy

Every tool is a folder with a `aikuora.tool.yml` and optional `template/`, `templates/`, and `dependents/` directories.

### 4.1 Linkable Tool (e.g. prettier)

```
tools/prettier/
├── aikuora.tool.yml         # Tool metadata + linking instructions
└── template/                # Shareable config content
    ├── index.mjs            # export default { ... }
    └── package.json         # tool-level deps merged into packages/configs/package.json
```

When `kind: shareable`, content goes to `packages/configs/src/prettier/` instead of a standalone package. Consumers import as `@<scope>/configs/prettier`.

```yaml
# tools/prettier/aikuora.tool.yml
name: prettier
lang: typescript
kind: shareable              # contributes to packages/configs/src/prettier/
requires:
  - pnpm                     # ensures pnpm → node → moon are set up first

# Workspace-level integrations applied on aikuora add prettier
workspace:
  vscode:
    extensions:
      - esbenp.prettier-vscode
    settings:
      editor.formatOnSave: true
      "[typescript]":
        editor.defaultFormatter: "esbenp.prettier-vscode"
      "[typescriptreact]":
        editor.defaultFormatter: "esbenp.prettier-vscode"
      "[json]":
        editor.defaultFormatter: "esbenp.prettier-vscode"
  claude:
    hooks:
      PostFileWrite:
        - matcher: "*.{js,jsx,ts,tsx,mjs,cjs,json,md,css,scss,yaml,yml}"
          command: 'pnpm exec prettier --write "$FILE"'
  moon:
    file: typescript
    tasks:
      - name: format
        command: prettier
        args: ['--write', '.']
        options:
          cache: false
      - name: format-check
        command: prettier
        args: ['--check', '.']

# Linking instructions (how to consume this config from a target — kind: none tools)
link:
  dependency: true # add as devDependency in target
  targetFile: 'prettier.config.mjs'
  content: "export { default } from '{{packageName}}';\n"
```

### 4.2 Scaffoldable Tool (e.g. nextjs)

```
tools/nextjs/
├── aikuora.tool.yml         # Tool metadata + scaffold instructions
├── templates/                  # Handlebars templates
│   ├── package.json.hbs
│   ├── next.config.mjs.hbs
│   ├── moon.yml.hbs
│   └── src/
│       └── app/
│           ├── layout.tsx.hbs
│           └── page.tsx.hbs
```

```yaml
# tools/nextjs/aikuora.tool.yml
name: nextjs
kind: none
lang: typescript

scaffold:
  type: app # target directory: apps/
  devtools: # tools to auto-link after scaffold (supports {tool, variant} for explicit variant)
    - prettier
    - tool: eslint
      variant: nextjs
    - tool: tsconfig
      variant: nextjs
  moonTasks:
    - name: dev
      command: next dev
      args: ['--turbopack']
    - name: build
      command: next build
    - name: start
      command: next start
```

### 4.3 Hybrid Tool (e.g. tsconfig)

```
tools/tsconfig/
├── aikuora.tool.yml
├── template/                   # Multiple config variants (shareable content)
│   ├── base.json
│   ├── nextjs.json             # extends base
│   ├── library.json            # extends base
│   ├── expo.json               # extends base
│   └── package.json            # tool-level deps merged into packages/configs/
├── templates/                  # Optional: per-variant target templates
│   └── tsconfig.json.hbs
```

```yaml
# tools/tsconfig/aikuora.tool.yml
name: tsconfig
kind: shareable
lang: typescript
requires:
  - pnpm

link:
  dependency: true
  targetFile: tsconfig.json
  content: |
    {
      "extends": "{{packageName}}/base.json",
      "compilerOptions": { "outDir": "dist", "rootDir": "src" },
      "include": ["src"]
    }
  variants:
    - name: typescript
      default: true
    - name: nextjs
      forTools: [nextjs]           # auto-select when linking to a nextjs app
      content: |                   # per-variant content override
        {
          "extends": "{{packageName}}/base.json",
          "compilerOptions": {
            "lib": ["dom", "dom.iterable", "esnext"],
            "jsx": "preserve",
            "moduleResolution": "bundler",
            "noEmit": true
          },
          "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"]
        }
```

### 4.4 Tool with Dependents (e.g. shadcn — UI package tool)

A tool that scaffolds a package other projects can consume declares integration handlers in a `dependents/` directory. The handler file name matches the scaffold tool of the consuming project.

```
tools/shadcn/
├── aikuora.tool.yml
├── templates/                  # Handlebars templates for the package itself
│   ├── package.json.hbs
│   └── src/
│       └── index.ts.hbs
└── dependents/                 # Integration handlers for consuming projects
    ├── nextjs.ts               # How to wire packages/ui into a Next.js app
    └── expo.ts                 # How to wire packages/ui into an Expo app
```

```yaml
# tools/shadcn/aikuora.tool.yml
name: shadcn
kind: none
lang: typescript

scaffold:
  type: package
  devtools:
    - prettier
    - eslint
    - tailwind
  moonTasks:
    - name: build
      command: 'tsup'

# Maps consuming project's scaffold tool → handler file in dependents/
dependents:
  nextjs: nextjs.ts
  expo: expo.ts
```

```typescript
// tools/shadcn/dependents/nextjs.ts
import type { IntegrationHandler } from '@aikuora/cli/types';

export const integrate: IntegrationHandler = async ({ target, source, fs }) => {
  // Import package styles in the app's global CSS
  await fs.insertAfterLine(
    `${target.path}/src/app/globals.css`,
    /^@tailwind/,
    `@import "${source.scopedName}/styles/globals.css";`
  );
  // Add path alias in tsconfig
  await fs.mergeJson(`${target.path}/tsconfig.json`, {
    compilerOptions: {
      paths: { [`${source.scopedName}/*`]: [`${source.name}/src/*`] },
    },
  });
};
```

### 4.5 Python Tool (e.g. ruff)

```
tools/ruff/
├── aikuora.tool.yml
├── template/
│   ├── ruff.toml               # Centralized ruff config
│   └── package.json            # metadata only (consistency)
```

```yaml
# tools/ruff/aikuora.tool.yml
name: ruff
kind: shareable
lang: python

link:
  dependency: false # no npm dependency for python tools
  targetFile: 'ruff.toml'
  content: |
    extend = "../../tools/ruff/ruff.toml"
  moonTasks:
    - name: lint
      command: 'ruff check .'
```

### 4.5 Complete Built-in Tool List

```
cli/tools/                          # Shipped with the CLI package
│
│   Root tools (kind: root) — set up at workspace level, pinned to .prototools
├── moon/                           # Root: Moonrepo (pinned to .prototools)
├── node/                           # Root: Node.js runtime + package.json + toolchains.yml
├── pnpm/                           # Root: pnpm + pnpm-workspace.yaml (requires: node)
│
│   Shareable tools (kind: shareable) — contribute to packages/configs/
├── prettier/                       # Shareable: JS/TS formatter (requires: pnpm)
├── eslint/                         # Shareable: JS/TS linter flat config (requires: pnpm)
├── tsconfig/                       # Shareable: TS config with variants (requires: pnpm)
├── ruff/                           # Shareable: Python linter/formatter
├── vite/                           # Shareable: build config
├── tailwind/                       # Shareable: CSS framework preset
│
│   Scaffoldable tools (kind: none) — scaffold apps/packages/modules
├── nextjs/                         # Scaffoldable → apps/; auto-links prettier+eslint+tsconfig
├── expo/                           # Scaffoldable → apps/
├── ts-library/                     # Scaffoldable → packages/
├── python-library/                 # Scaffoldable → packages/
├── orpc/                           # Scaffoldable → packages/
└── langchain/                      # Scaffoldable → modules/
```

**Dependency chain for JS/TS tools**: `prettier / eslint / tsconfig → pnpm → node → moon`

When `aikuora add prettier` (or any JS shareable tool) runs, it first calls `ensureRequiredTools(['pnpm'])`, which recursively sets up `node` (writes `package.json` + `toolchains.yml`) and then `moon` (pinned in `.prototools`). All tools in the chain are idempotent — already-installed tools are skipped.

---

## 5. Monorepo Structure

```
<project-root>/
├── .prototools                    # Single file, at root. Managed by CLI
├── .moon/
│   └── workspace.yml              # Moonrepo config
├── aikuora.workspace.yml          # Workspace config (scope, structure, defaults)
│
├── apps/                          # Deployable applications
│   ├── web/                       # e.g.: scaffolded from tools/nextjs
│   │   ├── aikuora.project.yml    # tool: nextjs, dependencies: [prettier, eslint]
│   │   ├── moon.yml
│   │   └── ...
│   └── mobile/                    # e.g.: scaffolded from tools/expo
│       ├── aikuora.project.yml
│       ├── moon.yml
│       └── ...
│
├── packages/                      # Reusable internal libraries
│   ├── configs/                   # Consolidated TypeScript config package (created by CLI)
│   │   ├── package.json           # name: "@scope/configs", exports: { "./*": "./src/*/index.mjs" }
│   │   └── src/
│   │       ├── prettier/
│   │       │   └── index.mjs      # populated by aikuora add prettier
│   │       └── eslint/
│   │           └── index.mjs      # populated by aikuora add eslint
│   ├── ui/                        # e.g.: scaffolded from tools/shadcn
│   │   ├── aikuora.project.yml    # tool: shadcn, dependencies.tools: [tailwind]
│   │   └── ...
│   └── utils/
│       ├── aikuora.project.yml
│       └── ...
│
├── modules/                       # Domain-specific packages
│   ├── auth/                      # e.g.: scaffolded from tools/ts-library
│   │   ├── aikuora.project.yml
│   │   └── ...
│   └── credit-engine/             # e.g.: scaffolded from tools/langchain
│       ├── aikuora.project.yml
│       └── ...
│
└── tools/                         # Project-level tool overrides (only via aikuora add <tool> --local)
    └── prettier/                  # Example: forked built-in tool
        ├── aikuora.tool.yml
        └── template/
            ├── index.mjs
            └── package.json
```

---

## 6. Configuration Files

### 6.1 `aikuora.workspace.yml` — Workspace root config

**Location**: monorepo root.

```yaml
# aikuora.workspace.yml
project:
  name: 'my-project'
  scope: '@my-project' # npm scope for internal packages

structure:
  apps: 'apps'
  packages: 'packages'
  modules: 'modules'
  tools: 'tools'

defaults:
  node: 'lts' # Resolved at runtime to current LTS (e.g., 24.13.1)
  pnpm: 'latest' # Resolved at runtime to latest stable (e.g., 10.29.3)
  python: '3.12.x'
  uv: 'latest'

# Custom tool paths (in addition to built-ins + tools/)
# The CLI automatically scans: built-ins (node_modules) → tools/ → these paths
customTools:
  - './my-custom-tools/my-scaffold'
  - './my-custom-tools/my-linter'
```

### 6.2 `aikuora.project.yml` — Per-project dependency manifest

**Location**: each app, package, and module directory.

Written automatically by the CLI after scaffold/link operations. Can also be edited by the user to declare dependencies manually.

```yaml
# apps/dashboard/aikuora.project.yml
tool: nextjs          # scaffold tool used to create this project
type: app

dependencies:
  # Tool configs linked to this project (via `aikuora add <tool> <target>`)
  tools:
    - prettier
    - eslint
    - tsconfig
  # Workspace packages this project consumes (via `aikuora add <package> <target>`)
  # Adding an entry triggers the package's integration handler for this project
  projects:
    - packages/ui
```

When a project is added to `dependencies.projects`, the CLI:
1. Reads the source project's `aikuora.project.yml` → finds its scaffold `tool`
2. Reads that tool's `aikuora.tool.yml` → finds `dependents.<target.tool>`
3. Runs the integration handler against the target project

---

## 7. CLI Design

### 7.1 Commands

```
aikuora init                          # Initialize monorepo from scratch
aikuora add <tool> --name <n>         # Scaffold using a scaffoldable tool
aikuora add <tool> <target>           # Link a linkable tool to a target
aikuora add <tool> --local            # Fork a built-in tool to project tools/
aikuora add <package> <target>        # Add a workspace package as project dependency
aikuora sync                          # Sync .prototools, workspace, and tool links
aikuora info                          # Show monorepo status
aikuora list tools                    # List all discovered tools and their capabilities
aikuora list apps|packages|modules    # List existing items
```

### 7.2 `init` — Initialize monorepo

```bash
aikuora init --name my-project --scope @my-project
```

**Deterministic actions:**

1. Create directory structure (apps/, packages/, modules/)
2. Generate `aikuora.tool.yml` with provided values
3. Generate `.prototools` with Node "lts" + pnpm "latest" (runtime-resolved aliases)
4. Generate `.moon/workspace.yml` with project globs
5. Generate `pnpm-workspace.yaml`
6. Generate `.gitignore`, base `README.md`
7. Run `proto install` to install runtimes
8. Run `pnpm install`

**Output (JSON mode):**

```json
{
  "action": "init",
  "success": true,
  "project": "my-project",
  "scope": "@my-project",
  "created": [".prototools", ".moon/workspace.yml", "aikuora.tool.yml"],
  "runtimes": { "node": "24.13.1", "pnpm": "10.29.3" }
}
```

### 7.3 `add --name` — Scaffold app, package, or module

```bash
aikuora add nextjs --name dashboard
aikuora add expo --name mobile
aikuora add ts-library --name utils
aikuora add python-library --name ml-utils
aikuora add orpc --name api-gateway
aikuora add langchain --name risk-agent
```

Note: the `type` (app/package/module) comes from the tool's `scaffold.type` in its `aikuora.tool.yml`. No need to specify it.

**Deterministic actions:**

1. Discover and load the tool's `aikuora.tool.yml`
2. Read root config → get scope, directory structure
3. Determine target directory from `scaffold.type`
4. Verify the name doesn't already exist
5. Render Handlebars templates with context variables
6. Copy rendered files to the target directory
7. Auto-link devtools listed in `scaffold.devtools`
8. Update `.prototools` if the runtime doesn't exist yet
9. Generate `moon.yml` with tasks from `scaffold.moonTasks`
10. Write `aikuora.project.yml` with tool, type, and linked devtools
11. Run `pnpm install` (or `uv sync` for Python)

**Output (JSON mode):**

```json
{
  "action": "add",
  "mode": "scaffold",
  "success": true,
  "tool": "nextjs",
  "name": "dashboard",
  "path": "apps/dashboard",
  "linkedTools": ["prettier", "eslint", "tsconfig", "tailwind", "vite"],
  "prototoolsUpdated": false,
  "moonTasksCreated": ["dev", "build", "lint", "format", "typecheck"]
}
```

### 7.4 `add <target>` — Link tool config to an existing project

```bash
aikuora add prettier apps/dashboard
aikuora add ruff modules/risk-agent
aikuora add tsconfig packages/utils --variant library
```

**Actions:**

1. Discover and load the tool's `aikuora.tool.yml`
2. Read `link` config
3. If tool has variants, auto-detect or use `--variant` flag
4. Add dependency in target's package.json (if `link.dependency: true`)
5. Create config file from `link.content` template
6. Update target's `moon.yml` if `link.moonTask` is defined
7. Append tool to `dependencies.tools` in target's `aikuora.project.yml`

**Output (JSON mode):**

```json
{
  "action": "add",
  "mode": "link",
  "success": true,
  "tool": "prettier",
  "target": "apps/dashboard",
  "configFile": "prettier.config.mjs",
  "variant": null,
  "moonTaskAdded": true
}
```

### 7.5 `add --local` — Fork built-in tool to project

```bash
aikuora add prettier --local
```

**Actions:**

1. Copy the built-in tool from `node_modules` to `tools/prettier/`
2. User can now modify configs, templates, or `aikuora.tool.yml`
3. Project tool takes precedence over the built-in (requires `customizable: true`)

### 7.6 `add <package> <target>` — Add workspace package as project dependency

```bash
aikuora add packages/ui apps/dashboard
aikuora add packages/ui apps/mobile
```

**Actions:**

1. Read source project's `aikuora.project.yml` → get scaffold tool (e.g. "shadcn")
2. Read target project's `aikuora.project.yml` → get scaffold tool (e.g. "nextjs")
3. Find `dependents[target.tool]` in source tool's `aikuora.tool.yml`
4. Load and invoke the integration handler with `IntegrationContext`
5. Append source to `dependencies.projects` in target's `aikuora.project.yml`

**Output (JSON mode):**

```json
{
  "action": "add",
  "mode": "project",
  "success": true,
  "source": "packages/ui",
  "target": "apps/dashboard",
  "scopedName": "@my-project/ui",
  "handlerInvoked": true
}
```

### 7.7 `sync` — Synchronize state

```bash
aikuora sync
```

**Actions:**

1. Scan all apps/packages/modules
2. Verify `.prototools` has all required runtimes
3. Verify `workspace.yml` and `pnpm-workspace.yaml` are up to date
4. Verify all tool links are consistent
5. Report inconsistencies or fix them automatically

### 7.8 `info` — Monorepo status

```bash
aikuora info
aikuora info --json
```

**Output:**

```json
{
  "project": "my-project",
  "scope": "@my-project",
  "apps": [
    {
      "name": "dashboard",
      "scaffoldedFrom": "nextjs",
      "path": "apps/dashboard",
      "linkedTools": ["prettier", "eslint", "tsconfig", "tailwind"]
    }
  ],
  "packages": [],
  "modules": [],
  "discoveredTools": {
    "linkable": ["prettier", "eslint", "tsconfig", "ruff", "vite", "tailwind"],
    "scaffoldable": ["nextjs", "expo", "ts-library", "python-library", "orpc", "langchain"],
    "hybrid": ["tsconfig"]
  },
  "runtimes": { "node": "22.x", "pnpm": "9.x", "python": "3.12.x", "uv": "latest" }
}
```

### 7.9 `list tools` — Discovered tools

```bash
aikuora list tools
aikuora list tools --json
```

**Human output:**

```
📦 Discovered tools:

  Linkable (devtools):
    prettier     (built-in)   JS/TS formatter
    eslint       (built-in)   JS/TS linter
    tsconfig     (built-in)   TypeScript config [variants: base, nextjs, library, expo]
    ruff         (built-in)   Python linter/formatter
    vite         (built-in)   Build config
    tailwind     (built-in)   CSS framework preset

  Scaffoldable (templates):
    nextjs       (built-in)   → apps/       [auto-links: prettier, eslint, tsconfig, tailwind, vite]
    expo         (built-in)   → apps/       [auto-links: prettier, eslint, tsconfig]
    ts-library   (built-in)   → packages/   [auto-links: prettier, eslint, tsconfig, vite]
    python-library (built-in) → packages/   [auto-links: ruff]
    orpc         (built-in)   → packages/   [auto-links: prettier, eslint, tsconfig]
    langchain    (built-in)   → modules/    [auto-links: ruff]

  Custom:
    my-scaffold  (custom)     → apps/       [auto-links: prettier, eslint]
```

### 7.10 Dual Output

All commands support the `--json` flag:

```bash
# Human-readable (default)
aikuora add nextjs --name dashboard
# ✅ Scaffolded nextjs app 'dashboard' at apps/dashboard
# 📦 Linked tools: prettier, eslint, tsconfig, tailwind, vite
# 🔧 moon.yml tasks: dev, build, lint, format, typecheck
# 🚀 Run: cd apps/dashboard && moon run dashboard:dev

# Machine-readable
aikuora add nextjs --name dashboard --json
# {"action":"add","mode":"scaffold","success":true,...}
```

---

## 8. CLI Code Structure

```
cli/
├── package.json
├── tsconfig.json
├── tools/                          # Built-in tools (shipped with CLI)
│   ├── prettier/
│   │   ├── aikuora.tool.yml
│   │   └── template/
│   ├── eslint/
│   ├── tsconfig/
│   ├── ruff/
│   ├── vite/
│   ├── tailwind/
│   ├── nextjs/
│   │   ├── aikuora.tool.yml
│   │   └── templates/
│   ├── expo/
│   ├── ts-library/
│   ├── python-library/
│   ├── orpc/
│   └── langchain/
│
├── src/
│   ├── index.ts                    # Entry: parse args, route to command
│   │
│   ├── commands/
│   │   ├── init.tsx                # Initialize monorepo
│   │   ├── add.tsx                 # Unified add (scaffold + link + fork + project dep)
│   │   ├── sync.ts                 # Synchronize state
│   │   ├── info.ts                 # Show status
│   │   └── list.ts                 # List tools/apps/packages/modules
│   │
│   ├── core/
│   │   ├── scanner.ts              # Filesystem scanner: discover tools
│   │   ├── resolver.ts             # Resolve tool by name (built-in → project → custom)
│   │   ├── loader.ts               # Load & validate aikuora.tool.yml per tool
│   │   └── capability.ts           # Detect capabilities (linkable/scaffoldable/hybrid)
│   │
│   ├── managers/
│   │   └── config.ts               # Read/update root aikuora.workspace.yml
│   │
│   ├── types/
│   │   ├── config.ts               # Workspace config schema (aikuora.workspace.yml)
│   │   ├── tool-config.ts          # Tool config schema (aikuora.tool.yml)
│   │   ├── project.ts              # Project manifest schema (aikuora.project.yml)
│   │   ├── integration.ts          # IntegrationHandler API (public SDK contract)
│   │   └── tool.ts                 # DiscoveredTool, ToolMap, ToolCapabilities
│   │
│   └── utils/
│       ├── output.ts               # Dual output (human/JSON)
│       ├── template.ts             # Handlebars template rendering
│       ├── prototools.ts           # Read/update .prototools
│       ├── moon.ts                 # Build/write/update moon.yml + addInheritedMoonTasks
│       ├── integration-fs.ts       # IntegrationFs runtime implementation
│       ├── integration.ts          # Integration utilities
│       └── project-file.ts         # Read/write aikuora.project.yml
│
├── dist/                           # Compiled output
└── bin/
    └── cli.mjs                     # Bin entry point
```

### Key Module: Scanner + Resolver

```typescript
// src/core/scanner.ts
export class ToolScanner {
  /**
   * Scans all tool sources in order:
   * 1. Built-in: <cli-package>/tools/
   * 2. Project: <monorepo-root>/tools/
   * 3. Custom: paths from aikuora.workspace.yml customTools
   *
   * Returns merged map. Project overrides built-in, custom overrides project.
   */
  async scanAll(): Promise<Map<string, DiscoveredTool>> { ... }
}

// src/core/capability.ts
export function detectCapabilities(toolDir: string): ToolCapabilities {
  return {
    linkable: existsSync(join(toolDir, "template")),   // singular
    scaffoldable: existsSync(join(toolDir, "templates")), // plural
  };
}
```

---

## 9. Handlebars Template Context

Variables available in all `.hbs` templates:

```typescript
interface TemplateContext {
  name: string; // "dashboard"
  scope: string; // "@my-project"
  scopedName: string; // "@my-project/dashboard"
  type: string; // "app" | "package" | "module"
  tool: string; // "nextjs"
  dir: string; // "apps/dashboard"
  linkedTools: string[]; // ["prettier", "eslint", ...]
  variant?: string; // "nextjs" (for tsconfig)
  year: number; // 2026
}
```

---

## 10. Claude Code Plugin

### 10.1 Plugin Structure

```
claude-code-plugin-monorepo/
├── README.md
├── plugin.json
│
├── skills/
│   ├── scaffold.md                 # Skill: create apps/packages/modules
│   ├── tooling.md                  # Skill: manage tool configs
│   ├── monorepo-conventions.md     # Skill: monorepo conventions
│   └── troubleshooting.md          # Skill: common issue resolution
│
├── commands/
│   ├── new.md                      # /new → scaffold (any type)
│   ├── link.md                     # /link → link tool to target
│   ├── sync.md                     # /sync → sync monorepo
│   └── info.md                     # /info → monorepo status
│
└── agents/
    └── monorepo-architect.md       # Autonomous agent for complex operations
```

### 10.2 Skill: scaffold.md

```markdown
# Scaffold — Create apps, packages, and modules

## When to use this skill

When the user wants to create a new app, package, or module in the monorepo.

## Decisions YOU make (contextual)

1. **Tool**: Infer which scaffoldable tool to use from the user's description
   - "I need a website" → nextjs
   - "Mobile app" → expo
   - "API service with oRPC" → orpc
   - "AI agent with LangChain" → langchain
   - "Shared library" → ts-library or python-library depending on context
   - Unsure? Run `aikuora list tools --json` to see available options
2. **Name**: If the user doesn't provide a name, suggest one
3. **Conflicts**: Before executing, verify with `aikuora info --json`

## Execution (ALWAYS delegate to CLI)

NEVER create files manually. ALWAYS use the CLI:

\`\`\`bash
aikuora add <tool> --name <n> --json
\`\`\`

## Interpret result

Parse JSON output and report: what was created, tools linked, next steps.
```

### 10.3 Skill: tooling.md

```markdown
# Tooling — Manage tool configs

## When to use this skill

When the user wants to link, customize, or create tool configurations.

## Decisions YOU make

1. If user says "add prettier to my app X":
   - Check if prettier is available: `aikuora list tools --json`
   - Link it: `aikuora add prettier apps/X --json`
2. If user wants to customize a built-in tool:
   - Fork it: `aikuora add <tool> --local --json`
   - Then edit files in tools/<tool>/ directly
3. If user modifies tools/<tool>/configs/, warn it affects all consumers

## Execution

\`\`\`bash
aikuora list tools --json
aikuora add <tool> <target> --json
aikuora add <tool> --local --json
\`\`\`

## IMPORTANT

For MODIFYING config content (e.g., add an ESLint rule), edit files
directly in tools/<tool>/configs/. For structural operations, ALWAYS
use the CLI.
```

### 10.4 Command: /new

```markdown
# /new

Creates a new app, package, or module in the monorepo.

## Usage

/new [description]

## Behavior

1. Run `aikuora list tools --json` to see scaffoldable tools
2. Run `aikuora info --json` to check current state
3. If description given, infer tool and name
4. If not, ask user what they need
5. Run `aikuora add <tool> --name <n> --json`
6. Report result with suggested next step
```

### 10.5 Agent: monorepo-architect.md

```markdown
# Monorepo Architect Agent

Autonomous agent for complex operations requiring multiple steps.

## Capabilities

- Create multiple apps/packages/modules in sequence
- Detect dependencies between packages and configure imports
- Plan entire project structure from a high-level description

## Flow

1. Receive high-level description from user
2. Run `aikuora info --json` to understand current state
3. Run `aikuora list tools --json` to know available tools
4. Plan operations (list of CLI commands)
5. Execute sequentially, verifying each result
6. Report complete structure and suggest next steps

## Example

User: "I need a project with a Next.js web app, an Expo mobile app,
a shared auth module, and an AI agent for credit risk analysis"

Plan:

1. `aikuora add ts-library --name auth --json`
2. `aikuora add langchain --name risk-agent --json`
3. `aikuora add nextjs --name web --json`
4. `aikuora add expo --name mobile --json`
5. Verify with `aikuora info --json`
6. Report and suggest next steps

## Constraints

- NEVER create files manually, ALWAYS use CLI
- ALWAYS verify state before and after each operation
- If an operation fails, DO NOT attempt to fix manually
```

---

## 11. Token Flow: Before vs After

### Before (natural language skills only)

```
User: "Create a Next.js app called dashboard"
│
├── Claude reads long skill (~800 tokens)
├── Claude reasons about files (~500 tokens)
├── Claude creates each file one by one (~1,200 tokens)
├── Claude updates .prototools (~100 tokens)
├── Claude links each tool config (~300 tokens)
└── Claude reports (~200 tokens)
│
Total: ~2,800 tokens + ~15 tool calls latency
```

### After (CLI + thin skill)

```
User: "Create a Next.js app called dashboard"
│
├── Claude reads skill (~50 tokens)
├── Claude runs: aikuora info --json (~30 tokens)
├── Claude runs: aikuora add nextjs --name dashboard --json (~50 tokens)
├── CLI executes everything deterministically (0 tokens)
└── Claude reports JSON result (~80 tokens)
│
Total: ~210 tokens + 2 tool calls latency
│
Reduction: ~93% fewer tokens, ~87% fewer tool calls
```

---

## 12. Implementation Details

### 12.1 CLI Build & Distribution

```jsonc
// cli/package.json
{
  "name": "@aikuora/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "aikuora": "./dist/index.js",
  },
  "files": ["dist", "tools"], // Include built-in tools in package
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
  },
  "dependencies": {
    "ink": "^5.0.1",
    "react": "^18.3.1",
    "meow": "^13.2.0",
    "handlebars": "^4.7.0",
    "yaml": "^2.0.0",
    "fs-extra": "^11.0.0",
    "zod": "^3.22.4",
  },
}
```

### 12.2 Tool Config Schema

```typescript
// Validated schema for aikuora.tool.yml per tool
interface ToolConfig {
  name: string;
  kind?: 'shareable' | 'root' | 'none'; // default: 'none'
  lang?: 'typescript' | 'python';
  customizable?: boolean;               // allows `add --local` fork; default: false

  // Root tool fields (kind: root only)
  installer?: 'proto';                  // install via proto
  version?: string;                     // version/alias passed to proto pin --resolve
  requires?: string[];                  // root tools that must be set up first

  // Scaffold-time prototools overrides (for non-root tools that need specific versions)
  prototools?: Record<string, string>;

  // Workspace-level integrations applied on aikuora add <tool> (shareable mode)
  workspace?: WorkspaceConfig;

  // Present if tool has template/ (linkable)
  link?: {
    dependency: boolean;
    targetFile: string;
    content: string; // Handlebars template
    variants?: {
      name: string;
      default?: boolean;
      forTools?: string[]; // auto-select for these scaffold tools
      content?: string;    // per-variant content override (replaces link.content)
    }[];
    moonTasks?: MoonTask[]; // plural; supports args and options
  };

  // Present if tool has templates/ (scaffoldable)
  scaffold?: {
    type: 'app' | 'package' | 'module';
    devtools: (string | { tool: string; variant: string })[]; // explicit variant selection
    moonTasks: MoonTask[];
  };
}

interface MoonTask {
  name: string;
  command: string;
  args?: string[];
  options?: MoonTaskOptions;
}

interface MoonTaskOptions {
  cache?: boolean;
}

interface WorkspaceConfig {
  vscode?: {
    extensions?: string[];
    settings?: Record<string, unknown>;
  };
  claude?: {
    hooks?: Record<string, ClaudeHookEntry[]>;
  };
  moon?: MoonInheritance;
}

interface ClaudeHookEntry {
  matcher: string;
  command: string;
}

interface MoonInheritance {
  file: string; // .moon/tasks/<file>.yml — Moon inherits tasks to all projects with matching `language`
  tasks: MoonTask[];
}
```

---

## 13. Implementation Roadmap

### Phase 1: CLI Core + Scanner ✅

1. Project setup: package.json, tsconfig, tsup
2. Config manager: read/write root `aikuora.tool.yml`
3. Tool scanner: discover tools from built-in + project + custom paths
4. Tool loader: parse and validate per-tool `aikuora.tool.yml`
5. Capability detector: linkable/scaffoldable/hybrid
6. `init` command
7. Dual output (human + JSON)

### Phase 2: `add` Command (unified) ✅

1. Unified `add` command (scaffold / link / local fork / project dependency)
2. Scaffold mode with Handlebars rendering and `aikuora.project.yml` write
3. Link mode with variant support and `aikuora.project.yml` update
4. Local fork mode (`--local`, requires `customizable: true`)
5. Project dependency mode with integration handler invocation
6. Prototools utility (auto-update `.prototools`)
7. Moon.yml utility
8. `IntegrationFs` runtime + `IntegrationHandler` contract
9. Three-file config system (`aikuora.workspace.yml`, `aikuora.tool.yml`, `aikuora.project.yml`)
10. `aikuora.project.yml` write after scaffold and link
11. Integration handler resolution and invocation

### Phase 3: Built-in Tools 🔄 In Progress

**Architectural decisions completed**:
- `kind: shareable | root | none` field in tool schema
- Removed `packageManager` / `runtime` fields — no longer in schema or any tool YAML
- `installer` / `version` / `requires` fields for root tools
- Consolidated `packages/configs/` package — per-tool export patterns (one `*` per pattern)
- Renamed `configs/` → `template/` for tool content; capability detection updated
- `workspace` config block (vscode, claude, moon) with idempotent merge behavior
- Moon task inheritance via `language` field in project `moon.yml` (no `inheritedBy`)
- `moonTasks` plural in `linkConfig` with `args` and `options` support
- `runShareable` + `runRoot` modes in `add` command + `applyWorkspaceSettings()`
- Fixed `getBuiltInToolsPath()` context-aware path resolution
- Removed `tools/` directory creation from `init`
- `proto pin --resolve` to store actual versions in `.prototools` (e.g. `22.14.0` not `lts`)
- `.prototools` formatting: blank line before `[settings]`, no accumulation on repeated runs
- Root tool scanner fix: tools with only `aikuora.tool.yml` (no `template/`) now discoverable
- `skipExisting` option in `renderAndCopy` — root tools never overwrite user-modified files
- Moon v2: `toolchains.yml` (with `javascript` section), `vcs.manager`, double quotes throughout
- `devtoolEntrySchema`: scaffold devtools support `{tool, variant}` for explicit variant selection
- Per-variant `content` field in `linkVariantSchema` (overrides `link.content` for that variant)
- `sortDeps`: all `package.json` deps sorted alphabetically
- `ensureRootPeerDeps`: peerDependencies from tool templates propagated to root `package.json`

**Built-in tools**:
- ✅ moon (root)
- ✅ node (root — writes `package.json` + `.moon/toolchains.yml`)
- ✅ pnpm (root — writes `pnpm-workspace.yaml`, requires: node)
- ✅ prettier (shareable — workspace: vscode + claude + moon)
- ✅ eslint (shareable — nextjs variant)
- ✅ tsconfig (shareable — typescript + nextjs variants with per-variant content)
- ✅ nextjs (scaffoldable → apps/ — auto-links: prettier + eslint/nextjs + tsconfig/nextjs)
- Remaining: vitest, tsup, tailwind, shadcn, commitlint, lefthook, release-please
- Commands: `sync`, `info`, `list`

### Phase 4: Claude Code Plugin

1. Minimalist skills
2. Commands (slash commands)
3. Monorepo-architect agent
4. Testing + documentation

### Phase 5: Publish

1. Publish CLI to npm as `@aikuora/cli`
2. Publish plugin to Claude Code marketplace
