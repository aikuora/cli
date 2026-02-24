---
paths:
  - "src/types/**/*.ts"
---

# Type and Schema Rules

## Schema-First Typing

All types must be inferred from Zod schemas — never declare a type separately
if a Zod schema exists:

```typescript
// Correct
export const fooSchema = z.object({ name: z.string() });
export type Foo = z.infer<typeof fooSchema>;

// Wrong — do not do this
export interface Foo { name: string; }
```

## Schema File Conventions

- One schema file per domain object
- File name matches the domain object: `config.ts`, `tool-config.ts`, `project.ts`
- Export both the schema and the inferred type from the same file

## Workspace Config Schema (aikuora.workspace.yml)

The `configSchema` in `src/types/config.ts` must have `name` and `scope` as
top-level fields (not nested under `project`):

```typescript
export const configSchema = z.object({
  name: z.string().min(1, 'Workspace name is required'),
  scope: z.string().regex(/^@[a-z0-9-]+$/, 'Scope must match /^@[a-z0-9-]+$/'),
  structure: structureConfigSchema.default(...),
  defaults: defaultsConfigSchema.default(...),
  customTools: z.array(z.string()).default([]),
});
```

This matches the spec's `workspace_config` entity which has `name` and `scope`
as top-level attributes. There is no `project` sub-key.

## Project File Schema (aikuora.project.yml)

The `projectFileSchema` in `src/types/project.ts` must include:

- `kind: z.enum(['app', 'package', 'module', 'shareable'])` — all four values
- `name: z.string()` — project name
- `scaffold_tool: z.string().optional()` — name of the scaffold tool used to create it
- `tools: z.array(z.string()).default([])` — linked tool names
- `dependencies: z.array(z.string()).default([])` — aikuora-tracked package dependencies

## Tool Config Kind Values

`toolConfigSchema.kind` must accept exactly `['shareable', 'root', 'none']`.
The value `'none'` is the default. The values `'link'`, `'scaffold'`, and
any other strings are not valid.

## Enum Exhaustiveness

When switching on discriminated union types, use `satisfies never` on the
default branch to catch unhandled cases at compile time.
