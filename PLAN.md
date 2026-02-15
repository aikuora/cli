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
| Config format            | YAML (per-tool + monorepo root)                 |

---

## 3. Core Concept: Unified Tool Model

There's no distinction between "devtool" and "scaffold template". **Everything is a tool** with capabilities the CLI auto-detects from the filesystem:

| Has `configs/` | Has `templates/` | Capability                                                                  |
| -------------- | ---------------- | --------------------------------------------------------------------------- |
| ✅             | ❌               | **Linkable** — can be linked to targets (e.g. prettier, eslint)             |
| ❌             | ✅               | **Scaffoldable** — can create new apps/packages/modules (e.g. nextjs, expo) |
| ✅             | ✅               | **Hybrid** — both (e.g. tsconfig with base configs + per-target templates)  |

**No hardcoded registry**. The CLI scans tool directories and reads each tool's `aikuora.config.yaml` to understand what it offers and how to use it.

### Tool Resolution Order

The CLI resolves tools from two sources, in order:

1. **Built-in tools** — shipped inside the CLI package (`node_modules/@aikuora/cli/tools/`)
2. **Project tools** — in the monorepo's `tools/` directory
3. **Custom tool paths** — declared in the root `aikuora.config.yaml`

Project tools override built-ins with the same name. This allows users to fork and customize any built-in tool by simply creating a `tools/<name>/` folder with their own `aikuora.config.yaml`.

---

## 4. Tool Anatomy

Every tool is a folder with a `aikuora.config.yaml` and optional `configs/`, `templates/`, and `generators/` directories.

### 4.1 Linkable Tool (e.g. prettier)

```
tools/prettier/
├── aikuora.config.yaml         # Tool metadata + linking instructions
├── configs/                    # Centralized config files
│   ├── index.mjs               # export default { ... }
│   └── package.json            # @<scope>/prettier-config
```

```yaml
# tools/prettier/aikuora.config.yaml
name: prettier
lang: typescript
runtime: node
packageManager: pnpm

prototools:
  node: '22.x'
  pnpm: '9.x'

# Linking instructions (how to consume this config from a target)
link:
  dependency: true # add as devDependency in target
  targetFile: 'prettier.config.mjs'
  content: |
    import config from "@{{scope}}/prettier-config";
    export default config;
  moonTask:
    name: format
    command: 'prettier --write .'
```

### 4.2 Scaffoldable Tool (e.g. nextjs)

```
tools/nextjs/
├── aikuora.config.yaml         # Tool metadata + scaffold instructions
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
# tools/nextjs/aikuora.config.yaml
name: nextjs
lang: typescript
runtime: node
packageManager: pnpm

prototools:
  node: '22.x'
  pnpm: '9.x'

# Scaffold instructions
scaffold:
  type: app # target directory: apps/
  devtools: # tools to auto-link after scaffold
    - prettier
    - eslint
    - tsconfig
    - tailwind
    - vite
  moonTasks:
    - name: dev
      command: 'next dev'
    - name: build
      command: 'next build'
    - name: lint
      command: 'eslint .'
    - name: format
      command: 'prettier --write .'
    - name: typecheck
      command: 'tsc --noEmit'
```

### 4.3 Hybrid Tool (e.g. tsconfig)

```
tools/tsconfig/
├── aikuora.config.yaml
├── configs/                    # Multiple config variants
│   ├── base.json
│   ├── nextjs.json             # extends base
│   ├── library.json            # extends base
│   ├── expo.json               # extends base
│   └── package.json            # @<scope>/tsconfig
├── templates/                  # Optional: per-variant target templates
│   └── tsconfig.json.hbs
```

```yaml
# tools/tsconfig/aikuora.config.yaml
name: tsconfig
lang: typescript
runtime: node
packageManager: pnpm

prototools:
  node: '22.x'
  pnpm: '9.x'

# Linking with variant support
link:
  dependency: true
  targetFile: 'tsconfig.json'
  content: |
    {
      "extends": "@{{scope}}/tsconfig/{{variant}}.json",
      "compilerOptions": {
        "outDir": "dist",
        "rootDir": "src"
      },
      "include": ["src"]
    }
  variants:
    - name: base
      default: true
    - name: nextjs
      forTools: [nextjs] # auto-select when linking to a nextjs app
    - name: library
      forTools: [ts-library, orpc]
    - name: expo
      forTools: [expo]
  moonTask:
    name: typecheck
    command: 'tsc --noEmit'
```

### 4.4 Python Tool (e.g. ruff)

```
tools/ruff/
├── aikuora.config.yaml
├── configs/
│   ├── ruff.toml               # Centralized ruff config
│   └── package.json            # metadata only (consistency)
```

```yaml
# tools/ruff/aikuora.config.yaml
name: ruff
lang: python
runtime: python
packageManager: uv

prototools:
  python: '3.12.x'
  uv: 'latest'

link:
  dependency: false # no npm dependency for python tools
  targetFile: 'ruff.toml'
  content: |
    extend = "../../tools/ruff/ruff.toml"
  moonTask:
    name: lint
    command: 'ruff check .'
```

### 4.5 Complete Built-in Tool List

```
cli/tools/                          # Shipped with the CLI package
├── prettier/                       # Linkable: JS/TS formatter
├── eslint/                         # Linkable: JS/TS linter (flat config)
├── tsconfig/                       # Hybrid: TS config with variants
├── ruff/                           # Linkable: Python linter/formatter
├── vite/                           # Linkable: build config
├── tailwind/                       # Linkable: CSS framework preset
├── nextjs/                         # Scaffoldable: Next.js app
├── expo/                           # Scaffoldable: Expo React Native app
├── ts-library/                     # Scaffoldable: TypeScript library
├── python-library/                 # Scaffoldable: Python library
├── orpc/                           # Scaffoldable: oRPC service package
└── langchain/                      # Scaffoldable: LangChain agent/chain
```

---

## 5. Monorepo Structure

```
<project-root>/
├── .prototools                    # Single file, at root. Managed by CLI
├── .moon/
│   └── workspace.yml              # Moonrepo config
├── aikuora.config.yaml             # CLI config (scope, custom tool paths)
│
├── apps/                          # Deployable applications
│   ├── web/                       # e.g.: scaffolded from tools/nextjs
│   │   ├── moon.yml
│   │   └── ...
│   └── mobile/                    # e.g.: scaffolded from tools/expo
│       ├── moon.yml
│       └── ...
│
├── packages/                      # Reusable internal libraries
│   ├── ui/                        # e.g.: scaffolded from tools/ts-library
│   └── utils/
│
├── modules/                       # Domain-specific packages
│   ├── auth/                      # e.g.: scaffolded from tools/ts-library
│   └── credit-engine/             # e.g.: scaffolded from tools/langchain
│
└── tools/                         # Project-level tools (override or extend built-ins)
    ├── prettier/
    │   ├── aikuora.config.yaml
    │   └── configs/
    │       ├── index.mjs
    │       └── package.json
    ├── eslint/
    │   ├── aikuora.config.yaml
    │   └── configs/
    │       ├── index.mjs
    │       └── package.json
    ├── tsconfig/
    │   ├── aikuora.config.yaml
    │   └── configs/
    │       ├── base.json
    │       ├── nextjs.json
    │       ├── library.json
    │       └── package.json
    ├── ruff/
    │   ├── aikuora.config.yaml
    │   └── configs/
    │       └── ruff.toml
    ├── vite/
    │   ├── aikuora.config.yaml
    │   └── configs/
    │       ├── index.mjs
    │       └── package.json
    └── tailwind/
        ├── aikuora.config.yaml
        └── configs/
            ├── index.mjs
            └── package.json
```

---

## 6. Root Configuration File

**Location**: `aikuora.config.yaml` at the monorepo root.

```yaml
# aikuora.config.yaml
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

---

## 7. CLI Design

### 7.1 Commands

```
aikuora init                          # Initialize monorepo from scratch
aikuora scaffold <tool> --name <n>    # Scaffold using a scaffoldable tool
aikuora link <tool> <target>          # Link a linkable tool to a target
aikuora add-tool <tool>               # Copy a built-in tool to project tools/ for customization
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

1. Create directory structure (apps/, packages/, modules/, tools/)
2. Generate `aikuora.config.yaml` with provided values
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
  "created": [".prototools", ".moon/workspace.yml", "aikuora.config.yaml"],
  "runtimes": { "node": "24.13.1", "pnpm": "10.29.3" }
}
```

### 7.3 `scaffold` — Create app, package, or module

```bash
aikuora scaffold nextjs --name dashboard
aikuora scaffold expo --name mobile
aikuora scaffold ts-library --name utils
aikuora scaffold python-library --name ml-utils
aikuora scaffold orpc --name api-gateway
aikuora scaffold langchain --name risk-agent
```

Note: the `type` (app/package/module) comes from the tool's `scaffold.type` in its `aikuora.config.yaml`. No need to specify it.

**Deterministic actions:**

1. Discover and load the tool's `aikuora.config.yaml`
2. Read root config → get scope, directory structure
3. Determine target directory from `scaffold.type`
4. Verify the name doesn't already exist
5. Render Handlebars templates with context variables
6. Copy rendered files to the target directory
7. Auto-link devtools listed in `scaffold.devtools`
8. Update `.prototools` if the runtime doesn't exist yet
9. Generate `moon.yml` with tasks from `scaffold.moonTasks`
10. Run `pnpm install` (or `uv sync` for Python)

**Output (JSON mode):**

```json
{
  "action": "scaffold",
  "success": true,
  "tool": "nextjs",
  "name": "dashboard",
  "path": "apps/dashboard",
  "scope": "@my-project/dashboard",
  "toolsLinked": ["prettier", "eslint", "tsconfig", "tailwind", "vite"],
  "prototoolsUpdated": false,
  "moonTasksCreated": ["dev", "build", "lint", "format", "typecheck"]
}
```

### 7.4 `link` — Link tool to an existing target

```bash
aikuora link prettier apps/dashboard
aikuora link ruff modules/risk-agent
aikuora link tsconfig packages/utils --variant library
```

**Actions:**

1. Discover and load the tool's `aikuora.config.yaml`
2. Read `link` config
3. If tool has variants, auto-detect or use `--variant` flag
4. Add dependency in target's package.json (if `link.dependency: true`)
5. Create config file from `link.content` template
6. Update target's `moon.yml` if `link.moonTask` is defined

### 7.5 `add-tool` — Copy built-in to project for customization

```bash
aikuora add-tool prettier
```

**Actions:**

1. Copy the built-in tool from `node_modules` to `tools/prettier/`
2. User can now modify configs, templates, or `aikuora.config.yaml`
3. Project tool takes precedence over the built-in

### 7.6 `sync` — Synchronize state

```bash
aikuora sync
```

**Actions:**

1. Scan all apps/packages/modules
2. Verify `.prototools` has all required runtimes
3. Verify `workspace.yml` and `pnpm-workspace.yaml` are up to date
4. Verify all tool links are consistent
5. Report inconsistencies or fix them automatically

### 7.7 `info` — Monorepo status

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

### 7.8 `list tools` — Discovered tools

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

### 7.9 Dual Output

All commands support the `--json` flag:

```bash
# Human-readable (default)
aikuora scaffold nextjs --name dashboard
# ✅ Created apps/dashboard (nextjs)
# 📦 Linked tools: prettier, eslint, tsconfig, tailwind, vite
# 🔧 moon.yml tasks: dev, build, lint, format, typecheck
# 🚀 Run: cd apps/dashboard && moon run dashboard:dev

# Machine-readable
aikuora scaffold nextjs --name dashboard --json
# {"action":"scaffold","success":true,...}
```

---

## 8. CLI Code Structure

```
cli/
├── package.json
├── tsconfig.json
├── tools/                          # Built-in tools (shipped with CLI)
│   ├── prettier/
│   │   ├── aikuora.config.yaml
│   │   └── configs/
│   ├── eslint/
│   ├── tsconfig/
│   ├── ruff/
│   ├── vite/
│   ├── tailwind/
│   ├── nextjs/
│   │   ├── aikuora.config.yaml
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
│   │   ├── init.ts                 # Initialize monorepo
│   │   ├── scaffold.ts             # Scaffold from a tool
│   │   ├── link.ts                 # Link tool to target
│   │   ├── add-tool.ts             # Copy built-in to project
│   │   ├── sync.ts                 # Synchronize state
│   │   ├── info.ts                 # Show status
│   │   └── list.ts                 # List tools/apps/packages/modules
│   │
│   ├── core/
│   │   ├── scanner.ts              # Filesystem scanner: discover tools
│   │   ├── resolver.ts             # Resolve tool by name (built-in → project → custom)
│   │   ├── loader.ts               # Load & validate aikuora.config.yaml per tool
│   │   └── capability.ts           # Detect capabilities (linkable/scaffoldable/hybrid)
│   │
│   ├── generators/
│   │   ├── scaffold.ts             # Render templates + copy to target
│   │   ├── linker.ts               # Link tool config to target
│   │   └── moon.ts                 # Generate moon.yml
│   │
│   ├── managers/
│   │   ├── prototools.ts           # Read/update .prototools
│   │   ├── workspace.ts            # Read/update workspace.yml + pnpm-workspace
│   │   └── config.ts               # Read/update root aikuora.config.yaml
│   │
│   └── utils/
│       ├── output.ts               # Dual output (human/JSON)
│       ├── handlebars.ts           # Handlebars helpers and render
│       ├── fs.ts                   # File system helpers
│       ├── exec.ts                 # Shell execution helpers
│       └── validation.ts           # Name validation, conflict detection
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
   * 3. Custom: paths from aikuora.config.yaml customTools
   *
   * Returns merged map. Project overrides built-in, custom overrides project.
   */
  async scanAll(): Promise<Map<string, DiscoveredTool>> { ... }
}

// src/core/capability.ts
export function detectCapabilities(toolDir: string): ToolCapabilities {
  return {
    linkable: existsSync(join(toolDir, "configs")),
    scaffoldable: existsSync(join(toolDir, "templates")),
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
aikuora scaffold <tool> --name <n> --json
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
   - Link it: `aikuora link prettier apps/X --json`
2. If user wants to customize a built-in tool:
   - Copy it: `aikuora add-tool <tool> --json`
   - Then edit files in tools/<tool>/ directly
3. If user modifies tools/<tool>/configs/, warn it affects all consumers

## Execution

\`\`\`bash
aikuora list tools --json
aikuora link <tool> <target> --json
aikuora add-tool <tool> --json
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
5. Run `aikuora scaffold <tool> --name <n> --json`
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

1. `aikuora scaffold ts-library --name auth --json`
2. `aikuora scaffold langchain --name risk-agent --json`
3. `aikuora scaffold nextjs --name web --json`
4. `aikuora scaffold expo --name mobile --json`
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
├── Claude runs: aikuora scaffold nextjs --name dashboard --json (~50 tokens)
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
// Validated schema for aikuora.config.yaml per tool
interface ToolConfig {
  name: string;
  lang: 'typescript' | 'python';
  runtime: 'node' | 'python';
  packageManager: 'pnpm' | 'uv';
  prototools: Record<string, string>;

  // Present if tool has configs/ (linkable)
  link?: {
    dependency: boolean;
    targetFile: string;
    content: string; // Handlebars template
    variants?: {
      name: string;
      default?: boolean;
      forTools?: string[]; // auto-select for these scaffold tools
    }[];
    moonTask?: { name: string; command: string };
  };

  // Present if tool has templates/ (scaffoldable)
  scaffold?: {
    type: 'app' | 'package' | 'module';
    devtools: string[];
    moonTasks: { name: string; command: string }[];
  };
}
```

---

## 13. Implementation Roadmap

### Phase 1: CLI Core + Scanner

1. Project setup: package.json, tsconfig, tsup
2. Config manager: read/write root `aikuora.config.yaml`
3. Tool scanner: discover tools from built-in + project + custom paths
4. Tool loader: parse and validate per-tool `aikuora.config.yaml`
5. Capability detector: linkable/scaffoldable/hybrid
6. `init` command
7. Dual output (human + JSON)

### Phase 2: Scaffold + Link

8. `scaffold` command with Handlebars rendering
9. `link` command with variant support
10. Auto-linking in scaffold (read `scaffold.devtools`)
11. Prototools manager (auto-update `.prototools`)
12. Moon.yml generator
13. `add-tool` command (copy built-in to project)

### Phase 3: Built-in Tools

14. Linkable tools: prettier, eslint, tsconfig, ruff, vite, tailwind
15. Scaffoldable tools: nextjs, ts-library
16. Scaffoldable tools: expo, python-library, orpc, langchain
17. `sync`, `info`, `list` commands

### Phase 4: Claude Code Plugin

18. Minimalist skills
19. Commands (slash commands)
20. Monorepo-architect agent
21. Testing + documentation

### Phase 5: Publish

22. Publish CLI to npm as `@aikuora/cli`
23. Publish plugin to Claude Code marketplace
