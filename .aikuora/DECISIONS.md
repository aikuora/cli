# Architecture Decision Records

This file tracks significant technical decisions made during the development of `@aikuora/cli`.
Each entry records the context, the decision, and the rationale so future contributors understand why — not just what.

---

## ADR-001: CLI Framework — ink + meow over citty + chalk

**Date:** 2026-02-14 (Phase 1.1)
**Status:** Accepted

**Context:**
The CLI needed a framework for argument parsing and terminal output. Initial candidates were `citty` (a modern CLI framework with built-in arg parsing) and `chalk` (terminal coloring).

**Decision:**
Use `ink` (React-based interactive CLI framework) for terminal UI and `meow` for argument parsing.

**Rationale:**
- `ink` enables component-based terminal UIs, making it easier to compose complex output from reusable React components
- `meow` is simple, battle-tested, and works natively with ESM — it pairs naturally with `ink`'s render model
- The combination gives us structured, testable UI components rather than imperative string concatenation

**Consequences:**
- Entry point must be `.tsx` (not `.ts`) for JSX support
- `tsconfig.json` and `tsup.config.ts` must configure `jsx: "react-jsx"`
- React is a required peer dependency

---

## ADR-002: Module Format — ESM only

**Date:** 2026-02-14 (Phase 1.1)
**Status:** Accepted

**Context:**
TypeScript packages can be compiled to CommonJS or ESM. The ecosystem has been migrating to ESM.

**Decision:**
Use ESM only (`"type": "module"` in `package.json`). Build output is `.js` (not `.cjs`). No dual-format build.

**Rationale:**
- `ink` and several key dependencies are ESM-only
- ESM is the future of the Node.js ecosystem; avoid the complexity of dual builds
- `tsup` makes ESM-only builds simple

**Consequences:**
- All imports must use explicit file extensions in source when not using `bundler` module resolution
- Cannot be `require()`d from CommonJS without dynamic import

---

## ADR-003: Runtime Version Management — Prototools aliases (not pinned versions)

**Date:** 2026-02-14 (Phase 1.1)
**Status:** Accepted

**Context:**
`.prototools` can store either concrete versions (e.g. `node = "22.14.0"`) or aliases (e.g. `node = "lts"`).

**Decision:**
The CLI project itself uses aliases (`lts`, `latest`). However, when `runRoot` installs a root tool via `proto pin --resolve`, it stores the resolved real version in the target monorepo's `.prototools`.

**Rationale (CLI project):**
- Using aliases ensures the CLI always runs on the current LTS and latest stable versions without manual updates
- The CLI is a tooling project, not a production app — it benefits from always-current runtimes

**Rationale (target monorepos):**
- Target monorepos should use pinned versions (`22.14.0`, not `lts`) for reproducibility
- `proto pin --resolve` resolves the alias at install time and stores the concrete version

**Consequences:**
- `proto pin <tool> <alias>` (without `--resolve`) is used for this CLI's `.prototools`
- `proto pin <tool> <alias> --resolve --to local --yes` is used for target monorepos via `pinProtoVersion()`
- Falls back to `updatePrototools()` if `proto` is not available on the system

---

## ADR-004: VS Code Settings Committed to Git

**Date:** 2026-02-14 (Phase 1.1)
**Status:** Accepted

**Context:**
`.vscode/` is commonly added to `.gitignore` to avoid committing editor-specific settings that may conflict between team members.

**Decision:**
Track `.vscode/` in git (removed from `.gitignore`).

**Rationale:**
- The settings contain team conventions (format-on-save, default formatter, YAML schema URLs for Moon) that should be consistent across the team
- Extension recommendations in `extensions.json` ensure new contributors get Prettier, YAML, and Moon Console installed automatically
- The settings are generic enough to not conflict (no personal keybindings, no workspace-specific paths)

---

## ADR-005: Brand-Agnostic Code Identifiers

**Date:** 2026-02-15 (Phase 1.2)
**Status:** Accepted

**Context:**
The project is branded "aikuora". Using the brand name in code identifiers (types, classes, schemas, functions) would require a large refactor if the project is ever renamed.

**Decision:**
All code identifiers use generic, descriptive names. The brand name "aikuora" only appears in:
- Config file names (`aikuora.workspace.yml`, `aikuora.tool.yml`, `aikuora.project.yml`)
- The CLI binary name (`aikuora`)
- The npm package name (`@aikuora/cli`)
- User-facing strings and documentation

**Examples:**
- `AikuoraConfig` → `Config`
- `AikuoraToolScanner` → `ToolScanner`
- `aikuoraConfigSchema` → `configSchema`

**Rationale:**
If the project is renamed, only config file names and user-facing strings change — no code refactor needed.

**Consequences:**
- Comments should NOT mention the brand name in internal decision rationale
- This convention must be enforced in code review

---

## ADR-006: Unified Tool Model — No Registry, Filesystem-Based Capability Detection

**Date:** 2026-02-15 (Phase 1.3)
**Status:** Accepted

**Context:**
The CLI needs to know what each tool can do (link config, scaffold projects, both). Options: (a) maintain a hardcoded registry, (b) read a `type` field from `aikuora.tool.yml`, (c) detect from filesystem.

**Decision:**
Detect capabilities from the filesystem:
- `template/` (singular) present → linkable
- `templates/` (plural) present → scaffoldable
- Both present → hybrid
- `aikuora.tool.yml` present (even without templates) → root tool (discoverable)

**Rationale:**
- No registry means adding a new tool requires only creating the directory — no code change
- The filesystem IS the source of truth; the config file supplements it
- Singular vs plural convention is unambiguous and self-documenting

**Consequences:**
- Directory naming is load-bearing: `template/` and `templates/` must not be confused
- The capability detection logic in `src/core/capability.ts` must be kept simple and documented

---

## ADR-007: Three-File Config System (workspace / tool / project)

**Date:** 2026-02-16 (Phase 2.2)
**Status:** Accepted

**Context:**
The original `aikuora.config.yaml` was used for both workspace-level config and tool-level config, creating ambiguity about which concerns belong where.

**Decision:**
Split into three distinct files with non-overlapping responsibilities:
1. `aikuora.workspace.yml` — monorepo root (project name, scope, structure, defaults)
2. `aikuora.tool.yml` — per-tool directory (capabilities, templates, link config, dependents)
3. `aikuora.project.yml` — per-project directory (scaffold tool, type, tool and project dependencies)

**Rationale:**
- Explicit file names make each file's role immediately clear
- Separate files allow separate owners: users own `aikuora.workspace.yml`, tool authors own `aikuora.tool.yml`, the CLI writes `aikuora.project.yml` automatically
- No ambiguity about where a given config key belongs

---

## ADR-008: Consolidated `packages/configs/` Package

**Date:** 2026-02-16 (Phase 3.2)
**Status:** Accepted

**Context:**
Each shareable tool (prettier, eslint, tsconfig) could publish its own npm package within the workspace (e.g. `@scope/prettier-config`, `@scope/eslint-config`). Alternatively, all can contribute to a single package.

**Decision:**
All TypeScript shareable tools contribute to a single `packages/configs/` package with wildcard exports:
```json
{ "exports": { "./*": "./src/*/index.mjs" } }
```

**Rationale:**
- One package is simpler to consume: `@scope/configs/prettier`, `@scope/configs/eslint`
- Avoids managing multiple internal package versions and inter-package dependencies
- New tools are added by dropping a directory — no new `package.json` or workspace registration needed
- Dependency merging is handled automatically: tool `template/package.json` deps are merged into `packages/configs/package.json`

**Constraint:**
Node.js only allows one `*` wildcard per export pattern. The CLI generates per-tool patterns instead of a single `"./*/*.json"` pattern.

---

## ADR-009: Moon Task Inheritance via `language` Field (not `inheritedBy`)

**Date:** 2026-02-17 (Phase 3.5)
**Status:** Accepted

**Context:**
When linking a shareable tool (e.g. prettier), Moon tasks (format, format-check) need to propagate to all projects that use the tool — without writing the same task into every project's `moon.yml`.

**Decision:**
Tasks are written to `.moon/tasks/<lang>.yml`. Projects with `language: <lang>` in their `moon.yml` automatically inherit all tasks from that file. The CLI writes the `language` field when scaffolding with a tool that declares `lang`.

**Previous approach (rejected):**
The `inheritedBy` block in `aikuora.tool.yml` was previously used to configure inheritance. This is not valid in Moon v2.

**Rationale:**
- Moon's native `language`-based inheritance is the correct v2 API
- A single task definition in `.moon/tasks/typescript.yml` reaches all TypeScript projects automatically
- Far more scalable than writing the same task into every `moon.yml` at link time

**Consequences:**
- `inheritedBy` field has been removed from the schema
- `addInheritedMoonTasks(workspaceRoot, inheritance)` writes to `.moon/tasks/<file>.yml`
- The `language` field in project `moon.yml` is written by the CLI at scaffold time (not manually)

---

## ADR-010: Dual Output — Human + JSON (`--json` flag)

**Date:** 2026-02-16 (Phase 1.7)
**Status:** Accepted

**Context:**
The CLI is designed to be invoked by Claude Code, which needs structured data — not human-readable strings. But human users running the CLI directly need readable output.

**Decision:**
All commands support a `--json` flag. When set, commands emit a single JSON object to stdout and suppress all human-readable UI (ink rendering, emoji, color). When not set, human-readable output is used.

**Rationale:**
- Claude Code parses JSON output; it cannot reliably parse free-form terminal output
- Human users benefit from clear, formatted feedback
- Centralized in `src/utils/output.ts`: `output()`, `outputSuccess()`, `outputError()`, `outputInfo()`

**Output contract:**
```json
{ "action": "<command>", "success": true|false, ...command-specific fields }
```

---

## ADR-011: `packages/configs/` Export Pattern Per Tool (not Wildcard-of-Wildcards)

**Date:** 2026-02-18 (Phase 3.11)
**Status:** Accepted

**Context:**
A single `"./*/*.json"` export pattern (two wildcards) was initially used for `packages/configs/package.json`. This caused runtime errors in Node.js.

**Decision:**
Generate per-tool export patterns using `buildToolExportPatterns()`. Each tool gets its own pattern:
- `"./prettier"` → `"./src/prettier/index.mjs"` (single-file tool)
- `"./eslint/*"` → `"./src/eslint/*.mjs"` (multi-variant tool)
- `"./tsconfig/*.json"` → `"./src/tsconfig/*.json"` (JSON variant tool)

**Rationale:**
Node.js specification: only one `*` wildcard is allowed per export pattern. Two wildcards in a single pattern is invalid.

**Consequences:**
- `buildToolExportPatterns()` must be called and its output merged into `packages/configs/package.json` every time a new tool is added
- Per-tool patterns must be updated when a tool changes its file structure

---

## ADR-012: `proto pin --resolve` for Target Monorepos (not aliases)

**Date:** 2026-02-18 (Phase 3.10)
**Status:** Accepted

**Context:**
When root tools (moon, node, pnpm) are installed in a target monorepo via `runRoot`, their versions must be written to the target's `.prototools`. Aliases (`lts`, `latest`) or resolved versions (`22.14.0`) could be used.

**Decision:**
Use `proto pin <tool> <version> --resolve --to local --yes` to store the real resolved version in the target's `.prototools`.

**Rationale:**
- Target monorepos benefit from pinned versions for reproducibility across CI and team machines
- Aliases can resolve to different versions over time, breaking reproducibility
- `pinProtoVersion()` skips the operation if the tool is already present (idempotent)
- Falls back to `updatePrototools()` if `proto` is not available

**Prototools blank line invariant:**
After every `proto pin` invocation, `reformatPrototools()` must be called to restore exactly one blank line before `[settings]`. Proto itself accumulates blank lines on repeated insertions.
