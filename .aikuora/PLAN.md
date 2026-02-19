# @aikuora/cli — Project Plan

## Vision

**Problem**: Claude Code skills written in natural language for monorepo management consume too many tokens and are slow because every scaffolding, configuration, and file management operation is reasoned from scratch.

**Solution**: A compiled TypeScript CLI that encapsulates all deterministic logic (scaffolding, configuration, tool linking, prototools/moonrepo updates), combined with a Claude Code plugin that acts as a thin orchestration layer for contextual decisions.

**Core principle**: Separate the deterministic (CLI) from the contextual (Claude Code). The CLI executes, Claude Code decides.

**Audience**: Developer teams managing JavaScript/TypeScript (and Python) monorepos with Moonrepo + Prototools. The CLI is distributed as `@aikuora/cli` on npm; the Claude Code plugin is distributed via the aikuora/skills marketplace.

---

## Token Efficiency Rationale

### Before (natural language skills only)

```text
User: "Create a Next.js app called dashboard"
├── Claude reads long skill (~800 tokens)
├── Claude reasons about files (~500 tokens)
├── Claude creates each file one by one (~1,200 tokens)
├── Claude updates .prototools (~100 tokens)
├── Claude links each tool config (~300 tokens)
└── Claude reports (~200 tokens)
Total: ~2,800 tokens + ~15 tool calls
```

### After (CLI + thin skill)

```text
User: "Create a Next.js app called dashboard"
├── Claude reads skill (~50 tokens)
├── Claude runs: aikuora info --json (~30 tokens)
├── Claude runs: aikuora add nextjs --name dashboard --json (~50 tokens)
├── CLI executes everything deterministically (0 tokens)
└── Claude reports JSON result (~80 tokens)
Total: ~210 tokens + 2 tool calls
Reduction: ~93% fewer tokens, ~87% fewer tool calls
```

---

## Epics & User Stories

### Epic 1: CLI Core — Initialize and Discover

**US-001:** As a developer, I want to run `aikuora init` so that a new monorepo is scaffolded with the correct directory structure, config files, and tool version pinning in a single command.

**Acceptance Criteria:**

- [x] Given a name and optional scope, `aikuora init --name my-project --scope @my-project` creates `apps/`, `packages/`, `modules/`, `scripts/` directories
- [x] Given `init` runs, it writes `aikuora.workspace.yml`, `.moon/workspace.yml`, `.prototools`, `.gitignore`, `.claude/settings.local.json.template`, `.vscode/settings.json`
- [x] Given the `--json` flag, the command outputs a structured JSON result suitable for programmatic consumption
- [x] Given the monorepo directory already exists, `init` does not overwrite user-modified files (`skipExisting: true` on root tools)

**Priority:** Must Have | **Complexity:** M | **Status:** Done

---

**US-002:** As a developer, I want the CLI to auto-discover all available tools (built-in, project-level, and custom) so that I can use any tool without configuring a registry.

**Acceptance Criteria:**

- [x] Given the CLI runs, it scans tools in order: built-ins (`node_modules/@aikuora/cli/tools/`) → project (`tools/`) → custom paths from `aikuora.workspace.yml`
- [x] Given a project tool has the same name as a built-in, the project tool takes precedence
- [x] Given a tool directory contains only `aikuora.tool.yml` (no `template/`), it is still discovered (root tools)
- [x] Given a tool has `template/` (singular), it is detected as linkable
- [x] Given a tool has `templates/` (plural), it is detected as scaffoldable
- [x] Given a tool has both, it is detected as hybrid

**Priority:** Must Have | **Complexity:** M | **Status:** Done

---

### Epic 2: Unified `add` Command

**US-003:** As a developer, I want to scaffold a new app, package, or module with `aikuora add <tool> --name <n>` so that the project is created with the correct structure, Moon tasks, and auto-linked devtools in one command.

**Acceptance Criteria:**

- [x] Given `aikuora add nextjs --name dashboard`, it creates `apps/dashboard/` with Handlebars-rendered templates, `moon.yml`, and `aikuora.project.yml`
- [x] Given the scaffold tool declares `devtools`, each devtool is auto-linked after scaffold (supports `{tool, variant}` for explicit variant selection)
- [x] Given the scaffold tool declares `moonTasks`, they are written to the project's `moon.yml`
- [x] Given the scaffold tool has a `lang` field, the project's `moon.yml` gets a `language` field enabling Moon task inheritance
- [x] Given `--json`, the command outputs scaffold result including `linkedTools` and `moonTasksCreated`

**Priority:** Must Have | **Complexity:** L | **Status:** Done

---

**US-004:** As a developer, I want to link a devtool config to an existing project with `aikuora add <tool> <target>` so that the project gets the correct config file and Moon tasks without manual setup.

**Acceptance Criteria:**

- [x] Given `aikuora add prettier apps/dashboard`, it creates `prettier.config.mjs` in the target, adds `@scope/configs` devDependency, and registers Moon tasks via workspace inheritance
- [x] Given the tool has variants, it auto-selects the correct variant based on the target project's scaffold tool, or uses `--variant` override
- [x] Given the tool declares a `workspace` block, `applyWorkspaceSettings()` idempotently merges VS Code settings/extensions, Claude hooks, and Moon inherited tasks
- [x] Given the tool is already linked, re-running does not duplicate hooks, extensions, or Moon tasks

**Priority:** Must Have | **Complexity:** M | **Status:** Done

---

**US-005:** As a developer, I want to fork a built-in tool with `aikuora add <tool> --local` so that I can customize it for my project without losing the ability to use the CLI for structural operations.

**Acceptance Criteria:**

- [x] Given `aikuora add prettier --local`, the built-in tool is copied to `tools/prettier/`
- [x] Given a project tool exists, it overrides the built-in of the same name in all subsequent operations
- [ ] Given a tool does not declare `customizable: true`, `--local` is rejected with a clear error message

**Priority:** Should Have | **Complexity:** S | **Status:** Partially done

---

**US-006:** As a developer, I want to add a workspace package as a project dependency with `aikuora add <package> <target>` so that the integration handler automatically wires the package into the consuming project.

**Acceptance Criteria:**

- [x] Given `aikuora add packages/ui apps/dashboard`, the CLI reads the source project's scaffold tool, finds the `dependents[target.tool]` handler, and invokes it
- [x] Given the handler runs, it can insert lines, merge JSON, and perform file operations via the `IntegrationFs` API
- [x] Given the operation succeeds, the source is appended to `dependencies.projects` in the target's `aikuora.project.yml`

**Priority:** Must Have | **Complexity:** L | **Status:** Done

---

### Epic 3: Built-in Tools

**US-007:** As a developer, I want a set of built-in tools shipped with the CLI so that I can set up a fully working monorepo without writing any tool configuration manually.

**Acceptance Criteria:**

- [x] Root tools (`moon`, `node`, `pnpm`) are set up automatically in the correct dependency order via `requires` chain
- [x] `proto pin --resolve` stores real resolved versions (e.g. `22.14.0`, not `lts`) in `.prototools`
- [x] Shareable tools (`prettier`, `eslint`, `tsconfig`) contribute to a consolidated `packages/configs/` package with wildcard exports
- [x] The `nextjs` scaffoldable tool creates a working Next.js app with correct devtools auto-linked
- [ ] `vitest` tool: shareable, Moon tasks: `test` + `test-watch`
- [ ] `tsup` tool: shareable, Moon task: `build`
- [ ] `tailwind` tool: shareable, PostCSS integration
- [ ] `shadcn` tool: scaffoldable package + nextjs integration handler
- [ ] `commitlint` tool: root, git hook via lefthook
- [ ] `lefthook` tool: root, `lefthook.yml` at workspace root
- [ ] `release-please` tool: root

**Priority:** Must Have | **Complexity:** XL | **Status:** In Progress (7/14 tools done)

---

### Epic 4: `sync`, `info`, `list` Commands

**US-008:** As a developer, I want `aikuora sync`, `aikuora info`, and `aikuora list` commands so that I can inspect and repair monorepo state without manual file inspection.

**Acceptance Criteria:**

- [ ] Given `aikuora info --json`, it returns project name, scope, all apps/packages/modules with their scaffold tools and linked devtools, and all discovered tools grouped by capability
- [ ] Given `aikuora list tools`, it prints linkable, scaffoldable, and custom tools with their sources and variants
- [ ] Given `aikuora sync`, it verifies `.prototools`, `workspace.yml`, `pnpm-workspace.yaml`, and tool link consistency — reporting or fixing discrepancies

**Priority:** Should Have | **Complexity:** M | **Status:** Not Started

---

### Epic 5: Claude Code Plugin

**US-009:** As a Claude Code user, I want a plugin with minimalist skills and slash commands so that I can manage the monorepo conversationally with minimal token usage.

**Acceptance Criteria:**

- [ ] Given the `scaffold` skill, Claude delegates all file creation to the CLI and never creates files manually
- [ ] Given the `tooling` skill, Claude can link, fork, and inspect tools via CLI commands
- [ ] Given `/new`, Claude infers the correct scaffoldable tool from user intent and runs `aikuora add <tool> --name <n> --json`
- [ ] Given `/sync`, Claude runs `aikuora sync --json` and reports the result
- [ ] Given the `monorepo-architect` agent, Claude can plan and execute multi-step scaffold operations autonomously

**Priority:** Must Have | **Complexity:** M | **Status:** Not Started

---

### Epic 6: Publish

**US-010:** As a user, I want to install `@aikuora/cli` from npm and the plugin from the skills marketplace so that I can use the tool without building from source.

**Acceptance Criteria:**

- [ ] `@aikuora/cli` is published to npm with correct `bin`, `files`, and `engines` fields
- [ ] A GitHub Actions release workflow publishes on tag push
- [ ] Installation documentation is complete

**Priority:** Must Have | **Complexity:** S | **Status:** Not Started

---

## Out of Scope (Future)

- Interactive prompts for `init` command (flags-only is intentional for Claude Code compatibility)
- `@aikuora/sdk` public package — publish integration types for third-party tool authors
- Python tools: `ruff`, `python-library`, `langchain` (architecture designed, not yet implemented)
- `expo` scaffoldable tool
- `orpc` scaffoldable tool
- `ts-library` scaffoldable tool
- `vite` shareable tool
- aikuora/skills marketplace skill permissions in `.claude/settings.local.json.template` (post-skills implementation)

---

## Risks & Constraints

- Proto availability: `proto pin --resolve` is used to store real versions; falls back to `updatePrototools()` if proto is not installed
- Moon v2 compatibility: schema uses `vcs.manager` (not `vcs.client`), `toolchains.yml` with `javascript` section, double-quoted YAML strings — must be maintained as Moon evolves
- Node.js export pattern constraint: only one `*` wildcard per export pattern is allowed; wildcard export patterns must be validated when adding new tool variants
- Brand-agnostic code convention: all internal identifiers must be generic (`Config`, not `AikuoraConfig`) to allow future renaming without codebase refactor
