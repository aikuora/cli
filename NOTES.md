# Implementation Notes

This document tracks implementation decisions and progress for the aikuora CLI project.

## Global Guidelines

### Code Quality & Conventions

**Brand-agnostic code**:

- ❌ Do NOT use brand names (Aikuora, aikuora) in code identifiers
- ✅ Use generic, descriptive names (Config, ToolConfig, etc.)
- **Rationale**: If the project is renamed, we don't want to refactor all the code
- **Examples**:
  - ❌ `AikuoraConfig` → ✅ `Config`
  - ❌ `AikuoraToolScanner` → ✅ `ToolScanner`
  - ❌ `aikuoraConfigSchema` → ✅ `configSchema`

**Code comments**:

- Only comment WHY, not WHAT (code should be self-documenting)
- Don't add internal decision comments (e.g., "brand-agnostic naming")
- Comment complex logic, edge cases, or non-obvious behavior
- Keep comments concise and relevant

**Other conventions**:

- Use Prettier for consistent formatting
- Prefer descriptive names over abbreviations
- Keep functions focused and single-purpose
- Use zod for runtime validation

---

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

**Dev tooling setup (ESLint + Vitest)**:

**ESLint configuration**:

- ✅ Flat config format (`eslint.config.ts`) with ESLint 9
- ✅ TypeScript ESLint with recommended rules
- ✅ React/Ink support (eslint-plugin-react, eslint-plugin-react-hooks)
- ✅ TSDoc plugin for API documentation (`tsdoc/syntax`: warn)
- ✅ Vitest plugin for test file best practices
- ✅ Custom rules enabled:
  - `@typescript-eslint/consistent-type-imports`: error (enforces `import type`)
  - `@typescript-eslint/consistent-type-exports`: error (enforces `export type`)
- ✅ Config files (`*.config.ts`) excluded from type-aware linting
- ✅ Scripts: `lint`, `lint:fix`

**Vitest configuration**:

- ✅ Test framework configured with Node environment
- ✅ Coverage provider: v8
- ✅ Coverage formats: text, json, html
- ✅ Test file patterns: `**/*.test.ts`, `**/*.test.tsx`
- ✅ Scripts: `test` (watch), `test:run` (once), `test:ui` (UI), `test:coverage`
- ✅ Sample test created for config manager (4 tests passing)

**Dependencies installed**:

- `eslint@9.39.2` (v9 for plugin compatibility)
- `typescript-eslint@8.55.0` (unified TypeScript ESLint package)
- `eslint-plugin-react`, `eslint-plugin-react-hooks` (Ink support)
- `eslint-plugin-tsdoc` (API documentation)
- `eslint-plugin-vitest` (test best practices)
- `vitest@4.0.18`, `@vitest/ui` (testing framework)

**Next steps**: Phase 1.2 - Config manager

---

### 1.2 Config manager: read/write root `aikuora.config.yaml`

**Status**: ✅ Completed

**Goal**: Create a config manager to read and write the root `aikuora.config.yaml` file with runtime validation using zod.

**Files created**:

- `src/types/config.ts`: Zod schemas and TypeScript types (brand-agnostic naming)
  - `projectConfigSchema`: Validates project name and npm scope
  - `structureConfigSchema`: Validates directory structure (apps, packages, modules, tools)
  - `defaultsConfigSchema`: Validates default runtime versions (node, pnpm, python, uv)
  - `configSchema`: Complete config schema with defaults
  - TypeScript types: `ProjectConfig`, `StructureConfig`, `DefaultsConfig`, `Config`
- `src/managers/config.ts`: Config manager implementation
  - `findConfigPath()`: Walk up directory tree to find config file
  - `readConfig()`: Read, parse, and validate YAML config
  - `writeConfig()`: Validate and write config to YAML
  - `createDefaultConfig()`: Generate default config with sensible defaults
  - `formatValidationError()`: Pretty-print zod validation errors

**Features implemented**:

- ✅ Zod schema validation with helpful error messages
- ✅ Automatic config file discovery (walks up from cwd)
- ✅ Safe parsing with detailed error types (not_found, invalid_yaml, validation_error, write_error)
- ✅ Default values for all optional fields
- ✅ Type-safe config object (TypeScript types from zod)
- ✅ YAML formatting with proper indentation

**Validation rules**:

- Project name: required, non-empty string
- Scope: optional, must match npm scope format (@scope-name)
- Structure: all fields default to standard names
- Defaults: all fields have sensible defaults (lts, latest, etc.)
- Custom tools: array of file paths, defaults to empty

**Testing**:

- ✅ Created test script to verify functionality
- ✅ Verified reading existing config
- ✅ Verified creating default config
- ✅ Verified writing config to file
- ✅ All tests passed successfully

**Refactoring (brand-agnostic code)**:

- ✅ Removed "Aikuora" prefix from all types and schemas
- ✅ `AikuoraConfig` → `Config`
- ✅ `AikuoraConfigSchema` → `configSchema`
- ✅ All schemas use camelCase (projectConfigSchema, structureConfigSchema, etc.)
- ✅ Updated comments to be brand-agnostic
- ✅ Removed test file from tsup.config.ts entry

---

### 1.3 Tool scanner: discover tools from built-in + project + custom paths

**Status**: ✅ Completed

**Goal**: Implement a tool scanner that discovers tools from multiple sources and detects their capabilities.

**Files created**:

- `src/types/tool.ts`: Tool types and interfaces
  - `ToolCapabilities`, `ToolSource`, `DiscoveredTool`, `ToolMap`
- `src/core/capability.ts`: Capability detection (7 tests)
  - `detectCapabilities()`, `isHybrid()`, `describeCapabilities()`
- `src/core/scanner.ts`: Tool discovery and scanning (4 tests)
  - `scanAllTools()`, `groupToolsByCapability()`, etc.
- `src/core/resolver.ts`: Tool resolution (9 tests)
  - `resolveTool()`, `toolExists()`, `getToolNames()`, `filterToolsBySource()`

**Features implemented**:

- ✅ Filesystem-based capability detection (no hardcoded registry)
- ✅ Multi-source tool discovery with override logic (custom \> project \> built-in)
- ✅ Built-in tools path resolution (works in dev and production)
- ✅ Tool grouping and filtering utilities
- ✅ All 24 tests passing

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
