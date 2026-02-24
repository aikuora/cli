# Architecture Decision Records (ADR)

*Owner: Planner + Engineer*

---

### ADR-001: TypeScript + Node.js ESM CLI

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The CLI must run on Node.js 24+, be distributed via npm, and be
  maintainable by TypeScript engineers familiar with monorepo tooling. The spec
  mandates TypeScript 5, Node.js 24+, and pnpm 10 in `technical_constraints`.
- **Decision:** TypeScript 5 compiled to ESM via tsup. Entry point is
  `src/index.tsx` compiled to `dist/index.js`.
- **Alternatives Considered:**
  1. CommonJS output — rejected: Node.js ESM is the modern standard; workspace
     packages use `"type": "module"` and expect ESM consumers.
  2. Deno — rejected: spec mandates Node.js 24+.
- **Consequences:**
  - Dynamic `import()` is used for JS handler loading in `src/utils/integration.ts`.
  - `import.meta.url` is used in `src/core/scanner.ts` and `src/utils/template.ts`
    for locating bundled assets.
  - Test files use Vitest which supports ESM natively.

---

### ADR-002: Ink + React 18 for Terminal UI

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec mandates `ink + React 18` for terminal UI rendering. The
  CLI has two output modes: human-readable Ink components and structured JSON
  (`--json` flag), matching the `ai_agent` actor requirements.
  This decision affects behaviors `INFO-001` and `LIST-001` in spec.yaml.
- **Decision:** Use Ink components for human-readable output. For `--json` mode,
  bypass Ink rendering and emit structured `console.log(JSON.stringify(...))`.
  Both modes exit with code 1 on failure.
- **Alternatives Considered:**
  1. Chalk + console.log only — rejected: spec mandates Ink.
  2. React server rendering — rejected: overkill for CLI output.
- **Consequences:**
  - Every command has two code paths: an async function (logic) and an Ink
    component (display). The async function runs regardless of mode; the Ink
    component is only rendered in human mode.
  - JSON mode must guarantee that every error produces `{ success: false, error: "..." }`
    to stderr with exit code 1.

---

### ADR-003: Zod for All Schema Validation

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec mandates Zod. Three config surfaces require validation:
  `aikuora.workspace.yml` (workspace_config), `aikuora.tool.yml` (tool_config),
  and `aikuora.project.yml` (project_file).
  This decision affects `STARTUP-001`, `TOOL-003`, and all ADD behaviors in
  spec.yaml.
- **Decision:** All YAML config files are parsed with the `yaml` library and
  then validated with Zod schemas. Zod `.safeParse()` is used everywhere to
  avoid throwing and to produce structured error messages.
- **Alternatives Considered:**
  1. JSON Schema (ajv) — rejected: spec mandates Zod; TypeScript inference is
     tighter with Zod.
- **Consequences:**
  - Schema types are inferred from Zod (`z.infer<typeof schema>`), keeping
    types and validation in sync.
  - `STARTUP-001` validation reuses the existing `configSchema` but requires
    that `name` and `scope` fields are top-level (not under a `project` key).
    The existing `configSchema` wraps them under `project`; this must be aligned.

---

### ADR-004: Workspace Config Schema Alignment (STARTUP-001 Constraint)

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec's `workspace_config` entity declares `name` and `scope`
  as top-level fields of `aikuora.workspace.yml`. The existing `configSchema`
  in `src/types/config.ts` wraps them under `project: { name, scope }`. The
  `STARTUP-001` behavior requires validating that `name` is present and `scope`
  matches `/^@[a-z0-9-]+$/` at the top level.
  This decision affects `STARTUP-001`, `INIT-001`, `INFO-001`, and `LIST-001`
  in spec.yaml.
- **Decision:** Align `configSchema` so that `name` and `scope` are top-level
  fields alongside `structure`, `defaults`, and `customTools`. This requires
  updating all existing read/write callsites. The `project` sub-object is
  removed; `scope` is required (not optional) to match the spec invariant.
  `STARTUP-001` validation is extracted into a `validateWorkspaceConfig`
  function called at the top of every command handler.
- **Alternatives Considered:**
  1. Keep `project.name` / `project.scope` and add a STARTUP-001 shim that
     reads them from the nested path — rejected: violates the spec schema; the
     init template writes `scope:` and `name:` at top level per the spec.
- **Consequences:**
  - Breaking change to the in-memory config shape; all callsites of
    `rootConfig.project.name` become `rootConfig.name` etc.
  - The `templates/init/aikuora.workspace.yml.hbs` template must be verified to
    emit top-level `name:` and `scope:` fields.
  - Existing workspaces initialized with the old schema will fail STARTUP-001
    until re-initialized.

---

### ADR-005: Project Discovery by Directory Scan (not Registry File)

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec states: "Projects are discovered by scanning the
  directories declared in `aikuora.workspace.yml`'s `structure` property and
  reading `aikuora.project.yml` files found there." There is no separate
  projects registry file. This design is used by `INFO-001` and `LIST-001`.
  This decision affects `INFO-001` and `LIST-001` behaviors in spec.yaml.
- **Decision:** Implement `scanProjects(workspaceRoot, structure)` in
  `src/utils/project-scanner.ts` that walks the `apps`, `packages`, and
  `modules` directories, finds all subdirectories containing an
  `aikuora.project.yml`, and returns a list of `ProjectFile` objects with their
  paths. The `kind` field from `project_file` drives filtering for `list apps`,
  `list packages`, `list modules`.
- **Alternatives Considered:**
  1. Maintain a projects registry in `aikuora.workspace.yml` — rejected: spec
     explicitly says discovery is by scan, not registry.
- **Consequences:**
  - `aikuora list packages` includes projects with `kind=shareable`; the scanner
    must not filter them out.
  - Root tool installations (which produce no `aikuora.project.yml`) are
    naturally excluded from all scan results.

---

### ADR-006: Handlebars for Scaffold Template Rendering

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec mandates Handlebars for scaffold template rendering.
  Templates are `.hbs` files in `templates/` (workspace init) and `tools/<name>/templates/`
  (scaffold tools). This decision affects `ADD-001` in spec.yaml.
- **Decision:** Use `handlebars` for all template rendering. Files ending in
  `.hbs` are rendered and the `.hbs` extension is stripped. Files ending in
  `.template` are copied verbatim (escape hatch for files that contain
  Handlebars-like syntax). Plain files are copied as-is.
- **Alternatives Considered:**
  1. EJS — rejected: spec mandates Handlebars.
  2. Template literals — rejected: less expressive for complex templates.
- **Consequences:**
  - All template context variables must be resolvable before any files are
    written (spec pre-condition for `ADD-001`).
  - Handlebars strict mode is not enforced; unresolvable variables silently
    produce empty strings. A pre-validation step should check required variables.

---

### ADR-007: Tool Priority Resolution (customTools > tools/ > built-in)

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec defines a three-level tool priority: paths listed in
  `customTools` in `aikuora.workspace.yml` take priority, then workspace
  `tools/` directory, then the CLI's built-in `tools/` directory. This decision
  affects `TOOL-001`, `ADD-005`, and all ADD behaviors in spec.yaml.
- **Decision:** `scanAllTools` merges three `ToolMap` objects using object
  spread: `{ ...builtInTools, ...projectTools, ...customTools }`. Later keys
  override earlier keys, so highest-priority source wins on name collision.
  `scanBuiltInTools` scans the CLI package's `tools/` directory; `scanProjectTools`
  scans the workspace `tools/` directory; `scanCustomTools` scans paths listed
  in `customTools`.
- **Alternatives Considered:**
  1. Explicit priority loop with first-match-wins — functionally equivalent;
     object spread is more concise and equally correct.
- **Consequences:**
  - `ADD-005` (local fork) must scan ONLY built-in tools (`scanBuiltInTools`)
    to verify the tool exists in built-ins before forking.
  - The `customizable` flag on tool configs is not a spec concept and should
    be removed from the local fork check; any built-in tool can be forked.

---

### ADR-008: Idempotency via String Marker Check

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec defines idempotency for declarative integration patches:
  if `idempotent_if` string is present in the target file, the ENTIRE integration
  block (VSCode settings, Claude hooks, Moon tasks, .gitignore) is skipped.
  This decision affects `INT-001`, `WS-001`, `WS-002`, `WS-003`, `WS-004`
  in spec.yaml.
- **Decision:** Idempotency for declarative patches is checked by a string
  presence test against the target file content. For workspace-level merges
  (VSCode settings, Claude hooks, Moon tasks, gitignore), individual entry
  deduplication is used since there is no single idempotent_if marker — the
  workspace-level integrations are applied incrementally, not as atomic blocks.
- **Alternatives Considered:**
  1. Hash-based content comparison — rejected: too fragile if users edit files.
  2. Sentinel comment lines — rejected: intrusive to user files.
- **Consequences:**
  - The `idempotentIf` check at the file-patch level (declarative engine in
    `src/utils/integration.ts`) correctly gates all ops for that file.
  - Workspace-level integration functions (`mergeJsonFile`, `mergeClaudeHooks`,
    `mergeGitignore`, `addInheritedMoonTasks`) deduplicate by content, not by
    a string marker.

---

### ADR-009: Phased Error Reporting for Scaffold Cleanup Failures

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec (ADD-001, ADD-003 on_failure) requires that if scaffold
  fails midway AND cleanup also fails, BOTH errors are reported and the partial
  directory is left in place. This is not currently implemented. This decision
  affects `ADD-001` and `ADD-003` behaviors in spec.yaml.
- **Decision:** Wrap scaffold operations in try/catch. On failure, attempt
  `fse.remove(targetDir)`. If cleanup also throws, emit both error messages
  and include "manually delete the directory before retrying" in the output.
  In `--json` mode, emit `{ success: false, error: "...", cleanupError: "...",
  manualCleanupRequired: true, partialPath: "..." }`.
- **Alternatives Considered:**
  1. Always attempt cleanup silently — rejected: spec explicitly requires
     reporting cleanup failures.
- **Consequences:**
  - Partial directories are left in place when cleanup fails; users must
    manually delete them.
  - The JSON error shape for cleanup failures includes extra fields beyond the
    standard `{ success: false, error }` shape.

---

### ADR-010: Variant Required Error Behavior

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec (ADD-002 pre_conditions, link_variant rules) requires
  that if a tool declares variants but no variant argument is provided, the
  operation exits with code 1 and lists the available variants. The current
  implementation silently picks the first/default variant. This decision
  affects `ADD-002` in spec.yaml.
- **Decision:** When `link.variants` is non-empty and no `--variant` flag is
  provided AND there is no `default: true` variant, exit with code 1. If there
  IS a variant with `default: true`, use it without error. The spec wording
  "must supply a variant argument" refers to tools that require explicit
  selection; tools with a designated default do not.
- **Alternatives Considered:**
  1. Always require explicit `--variant` when variants exist — rejected: the
     `default: true` flag on variant objects implies that a default is valid.
  2. Prompt interactively — rejected: spec says `--json` mode must never prompt;
     consistency requires non-interactive behavior in all modes.
- **Consequences:**
  - The `eslint` tool has `typescript` as `default: true`; scaffolding without
    a variant picks `typescript` silently. This is correct per the spec.
  - Tools with variants and no default (if any exist) will error without a
    `--variant` flag.

---

### ADR-011: Re-link Warning Only for Top-Level Tool

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec (ADD-002 side_effects, transactional invariants) states
  that a re-link warning is emitted only for the top-level tool that was
  directly requested, NOT for tools installed transitively via the `requires`
  chain. The current `runLink` emits no warning at all. This decision affects
  `ADD-002` in spec.yaml.
- **Decision:** In `runLink`, check if `toolName` already appears in the target
  project's `aikuora.project.yml` dependencies.tools. If so, emit a warning to
  stderr. Pass a `isTransitive: boolean` flag through the recursive requires
  chain; transitive tool applications suppress the warning.
- **Alternatives Considered:**
  1. Check the project file inside `appendToolDependency` — rejected: the
     warning must fire before re-applying the config, and the dependency
     check logic is already in the command layer.
- **Consequences:**
  - The `silent` flag used for required tools already suppresses output; the
    re-link warning check must be gated on `!silent` as well.

---

### ADR-012: VSCode Key Conflict Warning on Merge

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec (WS-001 side_effects) requires a warning to stderr for
  each VSCode settings key that already exists with a different value. The
  current `mergeJsonFile` silently overwrites. This decision affects `WS-001`
  in spec.yaml.
- **Decision:** In `mergeJsonFile` (used for `.vscode/settings.json`), compare
  each incoming key against the existing value. If a key exists and the value
  differs, emit `process.stderr.write(...)` before applying the new value.
  The new value is always applied (as per spec: "overwritten with the new value").
- **Alternatives Considered:**
  1. Reject conflicting keys — rejected: spec says new value wins with a warning.
  2. A separate `mergeVscodeSettings` function — this is the preferred approach
     since `mergeJsonFile` is also used for `.claude/settings.json` which has
     no conflict warning requirement. A dedicated VSCode merge function avoids
     conditional logic inside a generic helper.
- **Consequences:**
  - A new `mergeVscodeSettings` function is introduced alongside the existing
    `mergeJsonFile` to handle VSCode-specific merge semantics.

---

### ADR-013: STARTUP-001 as a Shared Guard Function

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec requires workspace config validation before every
  command. This is not currently implemented; commands call `readConfig()` but
  do not explicitly validate that `name` and `scope` are correct per spec
  invariants.
  This decision affects `STARTUP-001` in spec.yaml.
- **Decision:** Extract a `validateWorkspace(cwd?)` function in
  `src/utils/workspace.ts` that: (1) finds `aikuora.workspace.yml` by walking
  up, (2) parses and validates it against the aligned `configSchema`, and
  (3) returns `{ valid: true, config }` or `{ valid: false, error: string }`.
  Every command handler calls `validateWorkspace()` as its first step and exits
  with code 1 on invalid. The `init` command is exempt (it creates the file).
- **Alternatives Considered:**
  1. Middleware in the CLI entry point (`src/index.tsx`) — considered; rejected
     because `init` must bypass validation and the entry point would need
     exception logic. Per-command guards are more explicit.
- **Consequences:**
  - Validation failures in `--json` mode produce `{ success: false, error: "..." }`
    per the ai_agent actor requirements.
  - `findConfigPath` from `src/managers/config.ts` is reused by
    `validateWorkspace`.

---

### ADR-015: Code Optimization Phase Before Spec Alignment

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** Before implementing spec alignment fixes (P1) and new commands
  (P2, P3), the existing `src/commands/add.tsx` and `src/utils/moon.ts` contain
  several patterns that would make those tasks harder: duplicated boilerplate
  blocks, mid-file import statements, a copy-pasted task-builder, and a
  redundant config read call. Addressing these first reduces the risk of
  introducing regressions during the heavier spec alignment work and shortens
  each future session by removing noise.
  This decision does not affect any spec.yaml behaviors — all tasks in this
  phase are pure refactors with no observable behavior change.
- **Decision:** Add a Phase 0 "Code Optimization & Simplification" consisting
  of eight atomic tasks that each target one specific duplication or
  inconsistency. The existing phases 0-3 are renumbered to 1-4. Every task in
  the new phase lists exact files and a clear before/after description so an
  engineer can verify the refactor is complete without running the full test
  suite. Tasks that overlap with spec alignment bugs (e.g. `scanCustomTools`
  `dirname` vs `basename`) are included here for the readability fix; the spec
  behavior correction task remains in Phase 1 as a separate tracked item.
- **Alternatives Considered:**
  1. Inline cleanup during spec alignment tasks — rejected: mixes refactor
     intent with behavior change intent in the same session, making diffs harder
     to review and git-bisect less useful.
  2. Skip cleanup entirely — rejected: the duplicated `readConfig` + tool
     resolution + loader boilerplate (repeated four times each) would be
     copy-pasted again when adding the `validateWorkspace` guard, tripling
     the maintenance burden.
- **Consequences:**
  - The eight optimization tasks are all `spec_ref: null` — they do not close
    any spec behavior gap and must not be counted in spec coverage metrics.
  - P0-04 (`scanCustomTools` basename fix) overlaps with P1-03 (spec behavior
    fix). The engineer implementing P0-04 must leave the spec error message
    change to P1-03 to keep concerns separated.
  - P0-02 (extract `loadResolvedTool`) will be slightly revised when P1-01
    aligns the config schema — that is expected and acceptable; the helper
    will be easier to update once it exists in one place.

---

### ADR-014: Nested Workspace Prevention in init

- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The spec (INIT-001 pre_conditions) requires that `aikuora init`
  fails if any ancestor directory contains an `aikuora.workspace.yml`. The
  current `initCommand` does not walk up to check ancestors. This decision
  affects `INIT-001` in spec.yaml.
- **Decision:** Before creating `aikuora.workspace.yml`, call `findConfigPath`
  from the current directory. If it returns a non-null path, abort with the
  spec-required message: "Cannot initialize workspace inside an existing
  aikuora workspace at <path>".
- **Alternatives Considered:**
  1. Only check the current directory, not ancestors — rejected: spec explicitly
     says "walking up from cwd" must find no ancestor workspace.
- **Consequences:**
  - `findConfigPath` already walks up; the existing function can be reused
    directly in `initCommand` before any file writes.

---

*Owner: Planner + Engineer*
