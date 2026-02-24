# General Project Rules

## Language and Runtime

- TypeScript 5 strict mode only; never use `any` — use `unknown` and narrow it
- Node.js 24+ ESM only; never use CommonJS `require()` or `module.exports`
- All imports use `.js` extension (ESM convention), even for `.ts` source files

## Error Handling

- Functions return `{ success: boolean, data?: T, error?: string }` — never throw to callers
- Always use `safeParse` from Zod, never `parse` (which throws)
- Log errors with `outputError(message, { json })` — never use `console.error` directly
  except in the top-level catch in `src/index.tsx`

## Output

- Human-readable: use `outputSuccess`, `outputError`, `outputInfo` from `src/utils/output.ts`
- JSON mode: use `output({ action, success, ...fields }, { json: true })`
- Never mix modes: check `options.json` before choosing output path
- In JSON mode, every failure must emit `{ success: false, error: "..." }` and exit with code 1

## File Operations

- Use `fs/promises` for async writes; use `existsSync` / `readFileSync` for synchronous reads
- Never silently overwrite user files unless `skipExisting: false` is intentional
- Always use `resolve(cwd)` at function entry to get the absolute project root
- Use `join(...)` for all subsequent path construction

## Workspace Config

- `STARTUP-001`: every command handler (except `init`) must call `validateWorkspace()` first
- If validation fails, emit an error and return `{ success: false }` — never proceed
- The workspace config has top-level `name` and `scope` fields (not nested under `project`)

## Naming Conventions

- Source files: `kebab-case.ts` / `kebab-case.tsx`
- TypeScript types: `PascalCase`, inferred from Zod schemas with `z.infer<typeof schema>`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE` (e.g. `CONFIG_FILENAME`, `PROJECT_FILENAME`)

## Testing

- Test files co-located with source: `foo.test.ts` next to `foo.ts`
- Use `vitest` describe/it/expect pattern — never Jest APIs
- Never use `process.cwd()` in tests without mocking; use fixture paths instead
