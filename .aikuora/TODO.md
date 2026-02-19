# TODO

## Progress Overview

| Phase | Description | Done | Total | Progress |
|---|---|---|---|---|
| Phase 0 | Project Setup & Core Infrastructure | 7 | 7 | 100% |
| Phase 1 | CLI Core + Scanner | 7 | 7 | 100% |
| Phase 2 | `add` Command (Unified) | 11 | 11 | 100% |
| Phase 3 | Built-in Tools | 9 | 14 | 64% |
| Phase 4 | Claude Code Plugin | 0 | 5 | 0% |
| Phase 5 | Publish | 0 | 3 | 0% |
| Backlog | Future Enhancements | 0 | 5 | 0% |

**Legend:** `[ ]` Pending | `[~]` In Progress | `[x]` Done | `[!]` Blocked | `[-]` Cancelled

---

## Phase 0 — Project Setup & Core Infrastructure

- [x] P0-01 Configure package.json: `@aikuora/cli`, ESM, `tsup` build, `ink` + `meow` CLI framework
- [x] P0-02 Configure `tsconfig.json`: strict mode, ES2022 target, JSX support for ink
- [x] P0-03 Set up `tsup.config.ts` with JSX transformation for ink components
- [x] P0-04 Configure Prettier with `@ianvs/prettier-plugin-sort-imports` and VS Code integration
- [x] P0-05 Configure ESLint (flat config, v9): TypeScript ESLint + React/Ink + TSDoc + Vitest plugins
- [x] P0-06 Configure Vitest: Node environment, v8 coverage, watch + run + UI + coverage scripts
- [x] P0-07 Set up `.prototools` with `lts`/`latest` aliases for Node.js and pnpm

---

## Phase 1 — CLI Core + Scanner

- [x] P1-01 Config manager (`src/managers/config.ts`): read/write/validate `aikuora.workspace.yml` with zod
- [x] P1-02 Tool scanner (`src/core/scanner.ts`): discover tools from built-in, project, and custom paths — with override logic
- [x] P1-03 Tool loader (`src/core/loader.ts`): parse and validate `aikuora.tool.yml` per tool
- [x] P1-04 Capability detector (`src/core/capability.ts`): detect linkable/scaffoldable/hybrid from filesystem (`template/` vs `templates/`)
- [x] P1-05 Tool resolver (`src/core/resolver.ts`): resolve tool by name, filter by source, check existence
- [x] P1-06 `init` command (`src/commands/init.tsx`): copy `templates/init/`, render Handlebars templates, support `--json`
- [x] P1-07 Dual output utility (`src/utils/output.ts`): `output()`, `outputSuccess()`, `outputError()`, `outputInfo()` — JSON mode suppresses UI

---

## Phase 2 — `add` Command (Unified)

- [x] P2-01 Unified `add` command (`src/commands/add.tsx`): auto-detect mode from flags (scaffold / link / local fork / project dep)
- [x] P2-02 Scaffold mode: render Handlebars templates, write to `apps/|packages/|modules/`, auto-link devtools
- [x] P2-03 Link mode: create config file from `link.content` template, add devDependency, apply workspace settings
- [x] P2-04 Local fork mode (`--local`): copy built-in tool to `tools/<name>/`
- [x] P2-05 Project dependency mode: resolve source → find `dependents[target.tool]` handler → invoke integration handler
- [x] P2-06 Prototools utility (`src/utils/prototools.ts`): `pinProtoVersion()` with `proto pin --resolve`, `updatePrototools()` fallback, blank line fix
- [x] P2-07 Moon utility (`src/utils/moon.ts`): `buildMoonConfig()`, `addInheritedMoonTasks()`, write `.moon/tasks/<lang>.yml`
- [x] P2-08 Three-file config system: `aikuora.workspace.yml` / `aikuora.tool.yml` / `aikuora.project.yml` with distinct scopes
- [x] P2-09 `aikuora.project.yml` schema (`src/types/project.ts`) and write after scaffold/link (`src/utils/project-file.ts`)
- [x] P2-10 Integration handler system (`src/types/integration.ts`, `src/utils/integration-fs.ts`, `src/utils/integration.ts`)
- [x] P2-11 `applyWorkspaceSettings()`: idempotent merge of VS Code settings/extensions, Claude hooks, Moon inherited tasks

---

## Phase 3 — Built-in Tools

### Root Tools (kind: root)
- [x] P3-01 `moon` tool: `kind: root`, `installer: proto`, `version: latest` — pinned to `.prototools`
- [x] P3-02 `node` tool: `kind: root`, writes `package.json` + `.moon/toolchains.yml` with `javascript` section (Moon v2)
- [x] P3-03 `pnpm` tool: `kind: root`, writes `pnpm-workspace.yaml`, `requires: [node]`

### Shareable Tools (kind: shareable)
- [x] P3-04 `prettier` tool: shareable, workspace: vscode + claude (PostFileWrite hook) + moon (`format` + `format-check` tasks)
- [x] P3-05 `eslint` tool: shareable, variants: `typescript` (default) + `nextjs` (forTools: [nextjs]), moon: `lint` task
- [x] P3-06 `tsconfig` tool: shareable, variants: `typescript` + `nextjs` with per-variant content override, moon: `typecheck` task

### Scaffoldable Tools (kind: none)
- [x] P3-07 `nextjs` tool: scaffoldable → `apps/`, `lang: typescript`, auto-links prettier + eslint/nextjs + tsconfig/nextjs, moon tasks: dev + build + start
- [x] P3-08 `vitest` tool: shareable, moon tasks: `test` + `test-watch`
- [x] P3-09 `tsup` tool: shareable, moon task: `build`
- [ ] P3-10 `tailwind` tool: shareable, PostCSS integration
- [ ] P3-11 `shadcn` tool: scaffoldable → `packages/`, integration handlers for nextjs + expo
- [ ] P3-12 `commitlint` tool: `kind: root`, git hook via lefthook
- [ ] P3-13 `lefthook` tool: `kind: root`, writes `lefthook.yml` at workspace root
- [ ] P3-14 `release-please` tool: `kind: root`

### Phase 3 Commands
- [ ] P3-15 `sync` command: verify `.prototools`, `workspace.yml`, `pnpm-workspace.yaml`, and tool link consistency
- [ ] P3-16 `info` command: return JSON with all apps/packages/modules, tools, and runtimes
- [ ] P3-17 `list` command: list discovered tools grouped by capability (linkable / scaffoldable / hybrid)

---

## Phase 4 — Claude Code Plugin

- [ ] P4-01 Design skill marketplace structure for `aikuora/skills` (scaffold + tooling + monorepo-conventions + troubleshooting skills)
- [ ] P4-02 Implement `scaffold.md` skill: delegate all file creation to CLI, never create files manually
- [ ] P4-03 Implement `tooling.md` skill: link, fork, and inspect tools via CLI commands
- [ ] P4-04 Implement `/new`, `/sync`, `/info` slash commands
- [ ] P4-05 Implement `monorepo-architect` agent: autonomous multi-step scaffold planning and execution

---

## Phase 5 — Publish

- [ ] P5-01 Publish `@aikuora/cli` to npm (verify `bin`, `files`, `engines` fields)
- [ ] P5-02 Create GitHub Actions release workflow (publish on tag push)
- [ ] P5-03 Write installation and usage documentation

---

## Backlog — Future Enhancements

- [ ] BL-01 Add skill marketplace permissions to `.claude/settings.local.json.template` once skills are implemented (`Skill(monorepo:add)`, etc.)
- [ ] BL-02 Interactive prompts for `init` command (currently flags-only for Claude Code compatibility)
- [ ] BL-03 Publish `@aikuora/sdk` with `IntegrationHandler` types for third-party tool authors
- [ ] BL-04 Python tools: `ruff`, `python-library`, `langchain` (architecture designed, awaiting implementation)
- [ ] BL-05 Additional scaffoldable tools: `expo`, `orpc`, `ts-library`
