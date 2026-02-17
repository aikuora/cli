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
- [ ] Write `aikuora.project.yml` after scaffold (record tool + type + initial devtools)
- [ ] Write `aikuora.project.yml` after link (append tool to dependencies.tools)
- [ ] Implement `IntegrationFs` runtime (`src/utils/integration-fs.ts`)
- [ ] Resolve and invoke dependents/ handler when adding a project dependency

#### Phase 3 - Built-in Tools

- [ ] Create built-in tool templates in `tools/` directory (using `aikuora.tool.yml`)
- [ ] Implement pnpm tool (including pnpm-workspace.yaml generation)
- [ ] Implement prettier tool
- [ ] Implement eslint tool
- [ ] Implement typescript tool
- [ ] Implement other common tools (vitest, tsup, tailwind, shadcn, etc.)
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
