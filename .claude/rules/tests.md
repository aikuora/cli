---
paths:
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
---

# Test Rules

## Test Framework

Use Vitest only. Never import from `jest` or use `jest.*` APIs.

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
```

## Test File Location

Test files are co-located with the module they test:

- `src/core/scanner.ts` → `src/core/scanner.test.ts`
- `src/utils/workspace.ts` → `src/utils/workspace.test.ts`
- `src/commands/info.tsx` → `src/commands/info.test.ts`

## Derived Tests from spec.yaml

Each `derived_tests` entry in spec.yaml corresponds to at least one test case.
The `spec_ref` in `todo.yaml` links the task to the spec behavior; tests in that
task's files should cover the `given/when/then` scenarios from spec.yaml.

## File System Mocking

Do not use the real file system in unit tests. Use `vi.mock` for fs operations
or create a temporary directory with `tmp` / `node:os.tmpdir()` and clean up in
`afterEach`.

```typescript
// For tests that need a workspace:
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'aikuora-test-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });
```

## Test Naming

Use `describe` for the module or function, `it` for individual cases:

```typescript
describe('validateWorkspace', () => {
  it('returns valid for a workspace with correct name and scope', () => { ... });
  it('returns invalid when scope does not match /^@[a-z0-9-]+$/', () => { ... });
});
```

## Coverage Targets

Every behavior listed in spec.yaml derived_tests must have at least one
corresponding test. Priority order for new tests:

1. STARTUP-001 validation (invalid scope, missing name, valid config)
2. INIT-001 nested workspace prevention
3. ADD-002 variant required error
4. ADD-002 re-link warning
5. INFO-001 and LIST-001 output shapes
