# Codebase Intelligence

<!-- Keep this file concise. It is read at every session start. -->

## Project Type & Stack

CLI tool — Node.js 24+ + TypeScript, built with tsup (ESM output, minified), published to npm as `@aikuora/cli`.
Terminal UI via Ink (React for terminals). CLI parsing via meow. Schema validation via Zod. YAML via `yaml`. Templates via Handlebars.

## Key Directories

```text
src/
  index.tsx          — CLI entry; meow parses args; routes to commands
  commands/          — one file per subcommand (add.tsx, init.tsx)
  core/              — scanner, loader, resolver, capability detection
  managers/          — config.ts: read/write aikuora.workspace.yml
  types/             — Zod schemas + inferred TS types (config, tool-config, tool, project, integration)
  utils/             — template, moon, prototools, project-file, output, integration, integration-fs
tools/               — built-in tool definitions; one dir per tool with aikuora.tool.yml
templates/
  init/              — monorepo scaffold template (rendered on `aikuora init`)
dist/                — compiled output (ESM + shims)
```

## Entry Points

- **CLI**: `src/index.tsx` → meow parses flags → `initCommand()` / `addCommand()` (async) → renders Ink component if not `--json`
- **Build**: `tsup.config.ts` → entry `src/index.tsx`, format ESM, shims enabled, minified, no DTS
- **Tests**: `vitest.config.ts` → node env, globals enabled, co-located `*.test.ts` files
- **Tool config**: `tools/<name>/aikuora.tool.yml` — loaded by `src/core/loader.ts`
- **Workspace config**: `aikuora.workspace.yml` at monorepo root — managed by `src/managers/config.ts`

## Config File Hierarchy

```text
aikuora.workspace.yml          ← project root; name, scope, dirs, version defaults, customTools
aikuora.project.yml            ← each app/package/module; scaffold tool, type, linked tools, project deps
aikuora.tool.yml               ← each tool dir; kind, requires, link/scaffold/workspace config
```

## Tool Types (kind field)

| kind | What it does | Examples |
| --- | --- | --- |
| `root` | workspace-level setup; proto pin + gitignore + moon tasks | node, moon, pnpm |
| `shareable` | deploys config files into `packages/configs/src/<tool>/` | prettier, eslint, tsconfig, vitest, tsup, tailwind |
| `none` | scaffold-only tool; creates apps/packages/modules | nextjs |

## Add Command — 6 Modes

```text
addCommand(options)
  ├── --local                  → runLocal()            fork tool to <root>/tools/
  ├── --name <n>               → runScaffold()         create app/package/module from templates/
  ├── <target> (is a tool)     → runLink()             render link.content to targetFile in project
  ├── <target> (is a project)  → runProjectDependency() add workspace package + run integration handler
  ├── kind: shareable          → runShareable()        deploy config files to packages/configs/
  └── kind: root               → runRoot()             install workspace-level tool
```

## Code Patterns

**Result pattern — all core/manager functions return, never throw:**

```ts
interface SomeResult {
  success: boolean;
  data?: T;
  error?: { type: 'not_found' | 'invalid_yaml' | 'validation_error'; message: string; details?: unknown };
}

const result = loadToolConfig(toolPath);
if (!result.success) { /* handle result.error */ }
```

**Dual-mode output — all commands respect `--json`:**

```ts
import { output, outputSuccess, outputError } from '../utils/output.js';

// JSON mode: JSON.stringify(result) to stdout
// Human mode: console.log / console.error with prefix
output({ success: true, root }, options);
outputSuccess(`Initialized monorepo at ${root}`, options);
outputError(`Tool not found: ${name}`, options);
```

**Ink component pattern — commands are React components:**

```tsx
// src/commands/add.tsx
export function AddCommand({ toolName, ...props }: Props) {
  return <Text>Adding {toolName}…</Text>;
}
export const addCommand = async (options: AddOptions) => { /* async logic */ };
// index.tsx only renders <AddCommand/> when not in --json mode
```

**Zod schema + type pattern:**

```ts
// src/types/tool-config.ts
export const linkConfigSchema = z.object({
  dependency: z.boolean().default(false),
  targetFile: z.string(),
  content: z.string(),
  variants: z.array(linkVariantSchema).optional(),
  moonTasks: z.array(moonTaskSchema).optional(),
});
export type LinkConfig = z.infer<typeof linkConfigSchema>;
```

**Template rendering — Handlebars `.hbs` files:**

```ts
// src/utils/template.ts
await renderAndCopy(sourcePath, destPath, { name, scope, scopedName, type }, { skipExisting: true });
// .hbs files are rendered then saved without extension
// .template files are copied with extension stripped
// skipExisting: true → idempotent (won't overwrite)
```

**Moon task generation:**

```ts
// src/utils/moon.ts
await writeMoonYml(projectDir, buildMoonConfig(tasks, 'typescript'));
await addInheritedMoonTasks(root, { typescript: tasks }); // writes .moon/tasks/typescript.yml
```

**Prototools pinning:**

```ts
// src/utils/prototools.ts
await pinProtoVersion(root, 'node', 'lts');
// tries `proto pin --resolve` first; falls back to alias write in .prototools
```

**Integration handler invocation:**

```ts
// src/utils/integration.ts
// Source tool defines: dependents: { nextjs: 'dependents/nextjs' }
// File is imported dynamically and integrate(ctx) is called
await invokeIntegrationHandler({ root, sourcePath, targetPath, tools });
```

**Integration handler authoring (for tools with dependents/):**

```ts
// tools/<tool>/dependents/<target>.ts
import type { IntegrationHandler } from '../../src/types/integration.js';
export const integrate: IntegrationHandler = async (ctx) => {
  await ctx.fs.mergeJson('package.json', { dependencies: { 'some-pkg': '^1.0' } });
  await ctx.fs.insertAfterLine('src/app/layout.tsx', /^import/, 'import "./globals.css";');
};
```

## Capability Detection

```text
tools/<name>/
  template/   → linkable  (deploys config to packages/configs/; renders link to project)
  templates/  → scaffoldable (creates new app/package/module)
  (both)      → hybrid
  (neither)   → root tool or integration-only
```

## Tool Directory Layout

```text
tools/<name>/
  aikuora.tool.yml          — declarative config (required)
  template/                 — shareable: files copied to packages/configs/src/<name>/
    package.json            — deps to merge into packages/configs/package.json
    *.mjs / *.json          — actual config files (e.g. prettier.config.mjs)
  templates/                — scaffold: project template files (.hbs for dynamic)
    **/*
  dependents/               — integration handlers compiled to .js by tsup
    <target-tool>.ts        — runs when this tool's package is added as a dependency
```

## Built-in Tools Status

| Tool | Kind | Status | Notes |
| --- | --- | --- | --- |
| `node` | root | ✅ done | proto lts |
| `moon` | root | ✅ done | proto 2.0.0-rc.4 |
| `pnpm` | root | ✅ done | proto latest, requires node |
| `prettier` | shareable | ✅ done | VSCode + Claude hook + moon tasks |
| `eslint` | shareable | ✅ done | 2 variants: typescript, nextjs |
| `tsconfig` | shareable | ✅ done | 2 variants: typescript, nextjs |
| `vitest` | shareable | ✅ done | VSCode extension + moon tasks |
| `tsup` | shareable | ✅ done | 4 variants: library, cli, react, dual |
| `tailwind` | shareable | ✅ done | v4 CSS-first, VSCode extension |
| `nextjs` | none (scaffold) | ✅ done | devtools: prettier, tailwind, eslint, tsconfig |
| `shadcn` | — | ⏳ pending | P3-11 |
| `commitlint` | — | ⏳ pending | P3-12 |
| `lefthook` | — | ⏳ pending | P3-13 |
| `release-please` | — | ⏳ pending | P3-14 |

## Workspace Settings (applied by root/shareable tools)

Tools can declare `workspace` in their `aikuora.tool.yml` to:

- **VSCode extensions**: appended to `.vscode/extensions.json` (no duplicates)
- **VSCode settings**: shallow-merged into `.vscode/settings.json`
- **Claude hooks**: appended to `.claude/settings.json` hooks array (deduped by command)
- **Moon tasks**: written to `.moon/tasks/<lang>.yml` via `addInheritedMoonTasks()`
- **Gitignore**: patterns appended to root `.gitignore` (no duplicates)

## Key Gotchas

**ESM imports require `.js` extension** even for `.ts` source files:

```ts
import { loadToolConfig } from './loader.js'; // not './loader' or './loader.ts'
```

**Node.js export map allows only one `*` wildcard per pattern** — `buildToolExportPatterns()` enforces this.

**Template path resolution differs in dev vs. bundled:**

```ts
// getBuiltInToolsPath() in scanner.ts:
// bundled: dist/index.js → dirname → 1 up → cli root → /tools
// dev: src/core/scanner.ts → dirname → 2 up → cli root → /tools
```

**`skipExisting: true` on all root tool templates** — makes `runRoot()` idempotent on re-run.

**Variant resolution in `runLink()`** — checks `--variant` flag, then `default: true` in tool config, then first variant.

**`proto pin --resolve` vs. alias fallback** — if proto CLI not available, `pinProtoVersion()` writes the raw alias string to `.prototools` instead of resolving it to a concrete version.

**Moon task inheritance** — declaring `language: typescript` in a project's `moon.yml` causes Moon to auto-inherit tasks from `.moon/tasks/typescript.yml`. Tools write their base tasks there via `workspace.moon`.

## Conventions

- TypeScript strict mode; no `any`; `noUnusedLocals`, `noImplicitReturns` enforced
- Named exports only — no default exports
- ESM `.js` extensions on all internal imports
- Zod schemas and their inferred types co-located in `src/types/`
- Tool logic is purely declarative YAML — no TypeScript per tool (except `dependents/*.ts` handlers)
- Conventional commits: `feat:`, `fix:`, `chore:`
- Test files co-located: `src/core/loader.test.ts` not `tests/loader.test.ts`
- All operations are idempotent — check before write, skip if already present

## Active Context

**Current task:** P3 — Built-in Tools; next targets are sync/info/list commands then commitlint, lefthook, shadcn, release-please

**Relevant files:**

- `src/commands/add.tsx` — all 6 add modes; most complex file (~1000+ lines)
- `src/core/scanner.ts` — tool discovery; built-in + project + custom merge
- `src/types/tool-config.ts` — source of truth for all tool YAML schema
- `tools/tsup/aikuora.tool.yml` — most recently completed tool (uncommitted changes)
- `tools/nextjs/aikuora.tool.yml` — also has uncommitted changes
- `tsup.config.ts` — also has uncommitted changes

**Recent discoveries:**

- `sync`, `info`, `list` commands are stubbed in `src/index.tsx` but not yet implemented
- Integration handlers in `tools/<name>/dependents/*.ts` must be compiled to `.js` — this is a separate tsup build entry that is not yet wired up (Phase 3 pending task)
- The `packages/configs/` package is created lazily on first `runShareable()` call; subsequent calls merge into it
