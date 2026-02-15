# Implementation Notes

This document tracks implementation decisions and progress for the aikuora CLI project.

## Phase 1: CLI Core + Scanner

### 1.1 Project setup: package.json, tsconfig, tsup

**Status**: ✅ Completed

**Decisions**:

- Package name: `@aikuora/cli`
- Initial version: `0.1.0`
- Module type: ESM (`"type": "module"`)
- Build tool: `tsup` for fast TypeScript bundling
- CLI framework: `ink` (React-based interactive CLI framework)
- Argument parsing: `meow` (simple CLI argument parser, works well with ink)
- Output format: ESM only (`.js`)
- Binary name: `aikuora`
- Version management: `prototools` (manages Node.js and pnpm versions)

**Dependencies chosen**:

- `ink`: React-based CLI framework for building interactive terminal UIs
- `react`: Required peer dependency for ink
- `meow`: CLI argument parsing
- `handlebars`: Template rendering engine
- `yaml`: YAML parsing for config files
- `fs-extra`: Enhanced filesystem operations
- `zod`: Runtime schema validation for configs

**Dev Dependencies**:

- `typescript`: TypeScript compiler
- `tsup`: Build tool
- `@types/node`: Node.js type definitions
- `@types/fs-extra`: fs-extra type definitions
- `@types/react`: React type definitions for ink
- `prettier`: Code formatter
- `@ianvs/prettier-plugin-sort-imports`: Auto-sort imports by category

**Files created**:

- `.prototools`: Version aliases for Node.js ("lts") and pnpm ("latest"), resolved at runtime
- `package.json`: Package configuration with ESM module type, engines field synced with prototools
- `tsconfig.json`: TypeScript compiler configuration (strict mode, ES2022 target, JSX support)
- `tsup.config.ts`: Build configuration for tsup with JSX transformation
- `.gitignore`: Git ignore patterns (excludes .vscode/ to share team settings)
- `prettier.config.mjs`: Prettier configuration with import sorting
- `.vscode/extensions.json`: VS Code extension recommendations (Prettier)
- `.vscode/settings.json`: VS Code workspace settings (format on save)
- `src/index.tsx`: CLI entry point using ink + meow (React components)
- `README.md`: Project documentation

**Directory structure**:

- `src/commands/`: Command implementations (to be populated)
- `src/core/`: Core functionality (scanner, resolver, loader, capability)
- `src/generators/`: Code generation utilities
- `src/managers/`: Config and workspace managers
- `src/utils/`: Helper utilities
- `tools/`: Built-in tools directory (to be populated)

**Technology changes**:

- ✅ Replaced `citty` + `chalk` with `ink` (React-based CLI framework) + `meow` (argument parser)
- ✅ Added `.prototools` file to manage Node.js and pnpm versions
- ✅ Configured to use Node.js "lts" and pnpm "latest" (resolved at runtime, not pinned)
- ✅ Used `proto pin node lts` and `proto pin pnpm latest` without --resolve flag
- ✅ Configured JSX support in tsconfig.json and tsup.config.ts
- ✅ Renamed entry point to `index.tsx` for proper JSX handling

**Prototools approach**:

- Versions use aliases ("lts", "latest") that resolve at runtime
- This ensures the project always uses the current LTS and latest stable versions
- No need to update .prototools when new versions are released
- Command: `proto pin <tool> <alias>` (without --resolve)

**Verification**:

- ✅ Prototools resolves "lts" to Node 24.13.1 and "latest" to pnpm 10.29.3 at runtime
- ✅ .prototools contains aliases, not specific versions
- ✅ Dependencies installed successfully
- ✅ TypeScript compilation passes with JSX support
- ✅ CLI builds and executes with ink rendering on Node LTS
- ✅ Help command displays properly formatted output
- ✅ Unimplemented commands show appropriate messages

**Prettier setup**:

- ✅ Installed `prettier` and `@ianvs/prettier-plugin-sort-imports`
- ✅ Created `prettier.config.mjs` with import sorting configuration
- ✅ Created `.vscode/extensions.json` recommending Prettier extension
- ✅ Created `.vscode/settings.json` with format-on-save enabled
- ✅ Added `format` and `format:check` scripts to package.json
- ✅ Formatted all existing files with Prettier
- ✅ Updated `.gitignore` to commit `.vscode/` directory for team consistency

**Decision: VS Code Settings in Git**:

- The `.vscode/` directory is now tracked in git (removed from `.gitignore`)
- **Rationale**: Share editor configuration across the team for consistent development experience
- **Contains**: Editor settings (format on save, default formatter) and extension recommendations
- **Benefit**: New team members automatically get recommended extensions and proper formatting setup

**Next steps**: Phase 1.2 - Config manager

---

### 1.2 Config manager: read/write root `aikuora.config.yaml`

**Status**: Not Started

---

### 1.3 Tool scanner: discover tools from built-in + project + custom paths

**Status**: Not Started

---

### 1.4 Tool loader: parse and validate per-tool `aikuora.config.yaml`

**Status**: Not Started

---

### 1.5 Capability detector: linkable/scaffoldable/hybrid

**Status**: Not Started

---

### 1.6 `init` command

**Status**: Not Started

---

### 1.7 Dual output (human + JSON)

**Status**: Not Started

---

## Phase 2: Scaffold + Link

**Status**: Not Started

---

## Phase 3: Built-in Tools

**Status**: Not Started

---

## Phase 4: Claude Code Plugin

**Status**: Not Started

---

## Phase 5: Publish

**Status**: Not Started
