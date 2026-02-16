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

- [ ] Add `--json` flag support to init command
- [ ] Return structured JSON output for programmatic usage
- [ ] Maintain human-friendly terminal output by default

#### Phase 2 - Scaffold + Link Commands

- [ ] Implement `aikuora scaffold <tool> --name <name>` command
- [ ] Implement `aikuora link <tool> <target>` command
- [ ] Add validation for scaffoldable/linkable tool capabilities

#### Phase 3 - Built-in Tools

- [ ] Create built-in tool templates in `tools/` directory
- [ ] Implement pnpm tool (including pnpm-workspace.yaml generation)
- [ ] Implement prettier tool
- [ ] Implement eslint tool
- [ ] Implement typescript tool
- [ ] Implement other common tools (vitest, tsup, etc.)

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
