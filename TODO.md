# TODO

## Pending Items

### Claude Code Integration

- [ ] Add aikuora/skills marketplace skill permissions to `.claude/settings.local.json.template` once skills are implemented, for instance:
  - `Skill(monorepo:add)`
  - `Skill(monorepo:init)`
  - `Skill(monorepo:tools)`

### Implementation Roadmap

See [PLAN.md](./PLAN.md) for detailed specifications.

#### Phase 1.7 - Dual Output (Human + JSON)

- [x] Add `--json` flag support to init command
- [x] Return structured JSON output for programmatic usage
- [x] Maintain human-friendly terminal output by default

#### Phase 2 - `add` Command (unified)

- [x] Implement unified `aikuora add <tool>` command (replaces scaffold + link + add-tool)
- [x] Scaffold mode: `aikuora add nextjs --name dashboard`
- [x] Link mode: `aikuora add prettier apps/dashboard`
- [x] Local fork mode: `aikuora add prettier --local`
- [x] Add `--variant` flag for link mode
- [x] Prototools utility (`src/utils/prototools.ts`)
- [x] Moon.yml utility (`src/utils/moon.ts`)
- [x] Config file renames: `aikuora.workspace.yml` + `aikuora.tool.yml`
- [x] `dependents` field in `aikuora.tool.yml` schema
- [x] `IntegrationHandler` API types (`src/types/integration.ts`)
- [x] `aikuora.project.yml` schema (`src/types/project.ts`)
- [x] Write `aikuora.project.yml` after scaffold (record tool + type + initial devtools)
- [x] Write `aikuora.project.yml` after link (append tool to dependencies.tools)
- [x] Implement `IntegrationFs` runtime (`src/utils/integration-fs.ts`)
- [x] Resolve and invoke dependents/ handler when adding a project dependency

#### Phase 3 - Built-in Tools

- [x] `kind: shareable | root | none` field in tool schema
- [x] Consolidated `packages/configs/` package for TypeScript tools (wildcard exports)
- [x] Renamed `configs/` → `template/` for tool content (capability detection updated)
- [x] `workspace` config in `aikuora.tool.yml` (vscode, claude, moon)
- [x] Moon task inheritance system (`workspace.moon` → `.moon/tasks/<file>.yml`)
- [x] `moonTasks` plural in `linkConfig` + `args`/`options` support in `moonTaskSchema`
- [x] `runShareable` mode in `add` command
- [x] `applyWorkspaceSettings` (merges vscode settings, extensions, claude hooks, moon tasks)
- [x] Fixed `getBuiltInToolsPath()` context-aware resolution
- [x] Removed `tools/` dir creation from `init`
- [x] Implement prettier tool
- [ ] Create built-in tool templates in `tools/` directory (using `aikuora.tool.yml`)
- [x] Implement pnpm tool (pnpm-workspace.yaml + .moon/toolchain.yml)
- [x] Add `requires` field to tool schema (auto-setup dependencies)
- [x] Implement eslint tool
- [x] Implement tsconfig tool
- [ ] Implement nextjs tool — scaffold in `apps/`, devtools: prettier + eslint + tsconfig
- [ ] Implement vitest tool — shareable config in `packages/configs/src/vitest/`, moon tasks: test + test-watch
- [ ] Implement tsup tool — shareable config in `packages/configs/src/tsup/`, moon tasks: build
- [ ] Implement tailwind tool — shareable config in `packages/configs/src/tailwind/`, PostCSS integration
- [ ] Implement shadcn tool — links shadcn/ui config to a Next.js app (variant: nextjs)
- [ ] Implement commitlint tool — kind: root, shareable config, git hook via lefthook
- [ ] Implement lefthook tool — kind: root, installs lefthook.yml at workspace root
- [ ] Implement release-please tool — kind: root, release-please-config.json + .release-please-manifest.json
- [ ] Implement `sync`, `info`, `list` commands

#### Phase 4 - Claude Code Plugin

- [ ] Design skill marketplace structure for aikuora/skills
- [ ] Implement monorepo management skills
- [ ] Create skill documentation
- [ ] Publish to aikuora/skills marketplace

#### Phase 5 - Publish

- [ ] Publish @aikuora/cli to npm
- [ ] Create release workflow
- [ ] Add installation documentation

## Known Issues

- None currently

## Future Enhancements

- [ ] Consider adding interactive prompts for init command (instead of flags only)
- [ ] Add `aikuora sync` command for synchronizing monorepo state
- [ ] Add `aikuora info` command for showing monorepo status
- [ ] Add `aikuora list tools` command for listing discovered tools
- [ ] Public SDK: publish `@aikuora/sdk` with integration types for third-party tools
