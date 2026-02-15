# @aikuora/cli

A compiled TypeScript CLI that encapsulates all deterministic logic for monorepo management (scaffolding, configuration, tool linking, prototools/moonrepo updates).

## Architecture

**Principle**: Separate the deterministic (CLI) from the contextual (Claude Code). The CLI executes, Claude Code decides.

## Tech Stack

- **Monorepo orchestrator**: Moonrepo
- **Runtime/tool versioning**: Prototools (manages Node.js and pnpm versions)
- **CLI language**: TypeScript compiled to JS
- **CLI framework**: ink (React-based) + meow (argument parsing)
- **Templating engine**: Handlebars
- **Package manager (JS)**: pnpm
- **Package manager (Python)**: uv
- **Config format**: YAML

## Development

```bash
# Install dependencies
pnpm install

# Development mode (watch)
pnpm dev

# Build
pnpm build

# Type check
pnpm typecheck
```

## Commands

Commands will be implemented in phases:

- `aikuora init` - Initialize monorepo from scratch
- `aikuora scaffold <tool> --name <n>` - Scaffold using a scaffoldable tool
- `aikuora link <tool> <target>` - Link a linkable tool to a target
- `aikuora add-tool <tool>` - Copy a built-in tool to project tools/ for customization
- `aikuora sync` - Sync .prototools, workspace, and tool links
- `aikuora info` - Show monorepo status
- `aikuora list tools` - List all discovered tools and their capabilities

## Implementation Progress

See [NOTES.md](./NOTES.md) for detailed implementation progress and decisions.

See [PLAN.md](./PLAN.md) for the complete design document.

## License

MIT
