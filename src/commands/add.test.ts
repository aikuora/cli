/**
 * Tests for add command — Phase 5 derived_tests coverage.
 *
 * Covers:
 *   ADD-002: variant required, re-link warning, transitive no-warning
 *   ADD-005: local fork happy path, not-in-built-ins, fork-already-exists
 *   TOOL-002: requires chain does not re-emit warning for transitive deps
 *   ADD-001/ADD-003: scaffold cleanup on partial failure (cleanup ok / cleanup fails)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stringify } from 'yaml';

// ---- Mocked modules --------------------------------------------------------
// These are vi.mock'd so they intercept module resolution for submodules too.

vi.mock('../core/scanner.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../core/scanner.js')>();
  return {
    ...original,
    scanBuiltInTools: vi.fn(original.scanBuiltInTools),
    scanAllTools: vi.fn(original.scanAllTools),
  };
});

vi.mock('../core/loader.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../core/loader.js')>();
  return {
    ...original,
    loadToolConfig: vi.fn(original.loadToolConfig),
  };
});

vi.mock('../core/resolver.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../core/resolver.js')>();
  return {
    ...original,
    resolveTool: vi.fn(original.resolveTool),
  };
});

vi.mock('../utils/project-file.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/project-file.js')>();
  return {
    ...original,
    readProjectFile: vi.fn(original.readProjectFile),
    appendToolDependency: vi.fn(async () => undefined),
  };
});

vi.mock('fs-extra', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs-extra')>();
  return {
    ...original,
    copy: vi.fn(original.copy),
    remove: vi.fn(original.remove),
    default: {
      ...(original as unknown as Record<string, unknown>),
      copy: vi.fn(original.copy),
      remove: vi.fn(original.remove),
    },
  };
});

vi.mock('../utils/template.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/template.js')>();
  return {
    ...original,
    renderAndCopy: vi.fn(original.renderAndCopy),
  };
});

// ---- Imports after mocks ---------------------------------------------------

import fse from 'fs-extra';

import type { ToolConfig } from '../types/tool-config.js';
import type { ToolMap } from '../types/tool.js';
import { loadToolConfig } from '../core/loader.js';
import { resolveTool } from '../core/resolver.js';
import { scanAllTools, scanBuiltInTools } from '../core/scanner.js';
import { readProjectFile } from '../utils/project-file.js';
import { renderAndCopy } from '../utils/template.js';
import { runLink } from './add/link.js';
import { runLocal } from './add/local.js';
import { runScaffold } from './add/scaffold.js';

// ---- Helpers ---------------------------------------------------------------

function writeYaml(filePath: string, data: Record<string, unknown>): void {
  writeFileSync(filePath, stringify(data), 'utf-8');
}

/**
 * Create a minimal valid workspace dir and return its path.
 * Creates aikuora.workspace.yml with the given scope/name.
 */
function createWorkspace(
  prefix: string,
  opts: { name?: string; scope?: string } = {}
): string {
  const dir = mkdtempSync(join(tmpdir(), `add-test-${prefix}-`));
  writeYaml(join(dir, 'aikuora.workspace.yml'), {
    name: opts.name ?? 'test-mono',
    scope: opts.scope ?? '@test',
    structure: {
      apps: 'apps',
      packages: 'packages',
      modules: 'modules',
      tools: 'tools',
    },
    defaults: { node: 'lts', pnpm: 'latest', python: '3.12.x', uv: 'latest' },
    customTools: [],
  });
  return dir;
}

/**
 * Build a minimal in-memory ToolConfig for a link-mode tool.
 */
function makeLinkToolConfig(
  name: string,
  overrides: Partial<ToolConfig> = {}
): ToolConfig {
  return {
    name,
    kind: 'none',
    customizable: false,
    prototools: {},
    link: {
      dependency: false,
      targetFile: `.${name}rc.json`,
      content: '{}',
      variants: [],
    },
    ...overrides,
  };
}

/**
 * Build a minimal DiscoveredTool entry for use in mock ToolMaps.
 */
function makeDiscoveredTool(name: string, path: string) {
  return {
    name,
    path,
    source: 'built-in' as const,
    capabilities: { linkable: true, scaffoldable: false },
  };
}

// ---- Global setup ----------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = '';
  vi.clearAllMocks();
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ===========================================================================
// P5-03 — ADD-002: variant required and re-link warning
// ===========================================================================

describe('ADD-002 — variant required error', () => {
  it('emits an error and returns success=false when tool has variants but no default', async () => {
    tmpDir = createWorkspace('add002-no-default');

    const toolPath = join(tmpDir, 'tools', 'lint');
    mkdirSync(toolPath, { recursive: true });

    const toolConfig = makeLinkToolConfig('lint', {
      link: {
        dependency: false,
        targetFile: '.eslintrc.json',
        content: '{}',
        variants: [
          { name: 'react' },
          { name: 'vue' },
        ],
      },
    });

    const toolMap: ToolMap = { lint: makeDiscoveredTool('lint', toolPath) };
    vi.mocked(scanAllTools).mockReturnValue(toolMap);
    vi.mocked(resolveTool).mockReturnValue(toolMap['lint']);
    vi.mocked(loadToolConfig).mockReturnValue({ success: true, data: toolConfig });
    vi.mocked(readProjectFile).mockReturnValue(null);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runLink({
      toolName: 'lint',
      target: 'apps/web',
      json: true,
      cwd: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.success).toBe(false);
    expect(parsed.error as string).toMatch(/requires a variant/i);
    expect(parsed.error as string).toContain('react');
    expect(parsed.error as string).toContain('vue');
  });

  it('runs without error when tool has a variant with default=true', async () => {
    tmpDir = createWorkspace('add002-default-variant');

    const targetDir = join(tmpDir, 'apps', 'web');
    mkdirSync(targetDir, { recursive: true });

    const toolPath = join(tmpDir, 'tools', 'lint');
    mkdirSync(toolPath, { recursive: true });

    const toolConfig = makeLinkToolConfig('lint', {
      link: {
        dependency: false,
        targetFile: '.eslintrc.json',
        content: '{}',
        variants: [
          { name: 'react', default: true },
          { name: 'vue' },
        ],
      },
    });

    const toolMap: ToolMap = { lint: makeDiscoveredTool('lint', toolPath) };
    vi.mocked(scanAllTools).mockReturnValue(toolMap);
    vi.mocked(resolveTool).mockReturnValue(toolMap['lint']);
    vi.mocked(loadToolConfig).mockReturnValue({ success: true, data: toolConfig });
    vi.mocked(readProjectFile).mockReturnValue(null);

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runLink({
      toolName: 'lint',
      target: 'apps/web',
      json: true,
      cwd: tmpDir,
    });

    expect(result.success).toBe(true);
  });
});

describe('ADD-002 — re-link warning', () => {
  it('emits a warning to stderr when top-level tool is already linked to the project', async () => {
    tmpDir = createWorkspace('add002-relink');

    const targetDir = join(tmpDir, 'apps', 'web');
    mkdirSync(targetDir, { recursive: true });

    const toolPath = join(tmpDir, 'tools', 'prettier');
    mkdirSync(toolPath, { recursive: true });

    const toolConfig = makeLinkToolConfig('prettier');
    const toolMap: ToolMap = { prettier: makeDiscoveredTool('prettier', toolPath) };

    vi.mocked(scanAllTools).mockReturnValue(toolMap);
    vi.mocked(resolveTool).mockReturnValue(toolMap['prettier']);
    vi.mocked(loadToolConfig).mockReturnValue({ success: true, data: toolConfig });
    // Simulate that 'prettier' is already linked to this project
    vi.mocked(readProjectFile).mockReturnValue({
      kind: 'app',
      name: 'web',
      tools: ['prettier'],
      dependencies: [],
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runLink({
      toolName: 'prettier',
      target: 'apps/web',
      json: true,
      cwd: tmpDir,
      silent: false,
    });

    expect(result.success).toBe(true);
    // The warning must have been written to stderr
    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(stderrCalls.some((msg) => msg.includes('already linked'))).toBe(true);
  });

  it('does NOT emit a re-link warning when silent=true (transitive requires path)', async () => {
    tmpDir = createWorkspace('add002-silent');

    const targetDir = join(tmpDir, 'apps', 'web');
    mkdirSync(targetDir, { recursive: true });

    const toolPath = join(tmpDir, 'tools', 'base-lint');
    mkdirSync(toolPath, { recursive: true });

    const toolConfig = makeLinkToolConfig('base-lint');
    const toolMap: ToolMap = { 'base-lint': makeDiscoveredTool('base-lint', toolPath) };

    vi.mocked(scanAllTools).mockReturnValue(toolMap);
    vi.mocked(resolveTool).mockReturnValue(toolMap['base-lint']);
    vi.mocked(loadToolConfig).mockReturnValue({ success: true, data: toolConfig });
    // Simulate that 'base-lint' is already linked
    vi.mocked(readProjectFile).mockReturnValue({
      kind: 'app',
      name: 'web',
      tools: ['base-lint'],
      dependencies: [],
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runLink({
      toolName: 'base-lint',
      target: 'apps/web',
      json: true,
      cwd: tmpDir,
      silent: true, // transitive requires path
    });

    expect(result.success).toBe(true);
    // No re-link warning should be emitted for the silent (transitive) path
    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(stderrCalls.some((msg) => msg.includes('already linked'))).toBe(false);
  });
});

// ===========================================================================
// P5-04 — ADD-005: local fork
// ===========================================================================

describe('ADD-005 — local fork (runLocal)', () => {
  it('happy path: copies built-in tool to tools/<name>/', async () => {
    tmpDir = createWorkspace('add005-happy');

    const builtInPath = join(tmpDir, '_built-in', 'prettier');
    mkdirSync(builtInPath, { recursive: true });
    writeFileSync(join(builtInPath, 'aikuora.tool.yml'), 'name: prettier\nkind: none\n', 'utf-8');

    const toolMap: ToolMap = { prettier: makeDiscoveredTool('prettier', builtInPath) };
    vi.mocked(scanBuiltInTools).mockReturnValue(toolMap);
    vi.mocked(resolveTool).mockReturnValue(toolMap['prettier']);
    vi.mocked(fse.copy).mockResolvedValue(undefined);

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runLocal({
      toolName: 'prettier',
      json: true,
      cwd: tmpDir,
    });

    expect(result.success).toBe(true);
    expect(vi.mocked(fse.copy)).toHaveBeenCalledWith(
      builtInPath,
      join(tmpDir, 'tools', 'prettier')
    );
  });

  it('returns success=false when tool is not in built-in registry', async () => {
    tmpDir = createWorkspace('add005-not-built-in');

    // Return empty map — tool not found in built-ins
    vi.mocked(scanBuiltInTools).mockReturnValue({});
    vi.mocked(resolveTool).mockReturnValue(null);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runLocal({
      toolName: 'custom-only-tool',
      json: true,
      cwd: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.success).toBe(false);
    expect(parsed.error as string).toMatch(/not found in built-in registry/i);
  });

  it('returns success=false when a local fork already exists at tools/<name>/', async () => {
    tmpDir = createWorkspace('add005-already-exists');

    // Create the destination directory to simulate an existing fork
    const destination = join(tmpDir, 'tools', 'prettier');
    mkdirSync(destination, { recursive: true });

    const builtInPath = join(tmpDir, '_built-in', 'prettier');
    mkdirSync(builtInPath, { recursive: true });

    const toolMap: ToolMap = { prettier: makeDiscoveredTool('prettier', builtInPath) };
    vi.mocked(scanBuiltInTools).mockReturnValue(toolMap);
    vi.mocked(resolveTool).mockReturnValue(toolMap['prettier']);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runLocal({
      toolName: 'prettier',
      json: true,
      cwd: tmpDir,
    });

    expect(result.success).toBe(false);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.success).toBe(false);
    // Should inform about existing local fork
    expect(parsed.error as string).toMatch(/already exists locally/i);
  });

  it('can fork a tool that has customizable=false (no block on the customizable flag)', async () => {
    tmpDir = createWorkspace('add005-customizable-false');

    const builtInPath = join(tmpDir, '_built-in', 'eslint');
    mkdirSync(builtInPath, { recursive: true });

    // Tool with customizable: false — should NOT block the fork
    const toolMap: ToolMap = { eslint: makeDiscoveredTool('eslint', builtInPath) };
    vi.mocked(scanBuiltInTools).mockReturnValue(toolMap);
    vi.mocked(resolveTool).mockReturnValue(toolMap['eslint']);
    vi.mocked(fse.copy).mockResolvedValue(undefined);

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runLocal({
      toolName: 'eslint',
      json: true,
      cwd: tmpDir,
    });

    // The fork should succeed regardless of customizable flag
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// P5-06 — TOOL-002: requires chain does not re-emit warnings
// ===========================================================================

describe('TOOL-002 — requires chain does not emit re-link warning for transitive deps', () => {
  it('no re-link warning for tool A when tool B requires A and A is already linked', async () => {
    tmpDir = createWorkspace('tool002-requires');

    const targetDir = join(tmpDir, 'apps', 'web');
    mkdirSync(targetDir, { recursive: true });

    // tool-a: already linked, the "required" tool
    const toolAPath = join(tmpDir, 'tools', 'tool-a');
    mkdirSync(toolAPath, { recursive: true });

    // tool-b: the tool we are adding; requires tool-a
    const toolBPath = join(tmpDir, 'tools', 'tool-b');
    mkdirSync(toolBPath, { recursive: true });

    const toolAConfig = makeLinkToolConfig('tool-a');
    const toolBConfig = makeLinkToolConfig('tool-b', {
      requires: ['tool-a'],
      // Override to be kind=root so it can be wired via ensureRequiredTools
    });

    const toolADiscovered = makeDiscoveredTool('tool-a', toolAPath);
    const toolBDiscovered = makeDiscoveredTool('tool-b', toolBPath);

    // scanAllTools returns both tools
    vi.mocked(scanAllTools).mockReturnValue({
      'tool-a': toolADiscovered,
      'tool-b': toolBDiscovered,
    });

    // resolveTool: first call for tool-b (from addCommand), subsequent calls for tool-a
    vi.mocked(resolveTool)
      .mockImplementation((name) => {
        if (name === 'tool-b') return toolBDiscovered;
        if (name === 'tool-a') return toolADiscovered;
        return null;
      });

    // loadToolConfig: return different configs per path
    vi.mocked(loadToolConfig).mockImplementation((toolPath) => {
      if (toolPath === toolBPath) return { success: true, data: toolBConfig };
      if (toolPath === toolAPath) return { success: true, data: toolAConfig };
      return { success: false, error: { type: 'not_found' as const, message: 'not found' } };
    });

    // tool-a is already in the project's tools list
    vi.mocked(readProjectFile).mockReturnValue({
      kind: 'app',
      name: 'web',
      tools: ['tool-a'],
      dependencies: [],
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // Trigger runLink for tool-b (which requires tool-a internally via ensureRequiredTools)
    const result = await runLink({
      toolName: 'tool-b',
      target: 'apps/web',
      json: true,
      cwd: tmpDir,
    });

    expect(result.success).toBe(true);

    // No re-link warning should be emitted for tool-a (transitive via requires)
    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    const relinkWarnings = stderrCalls.filter((msg) =>
      msg.includes('already linked') && msg.includes('tool-a')
    );
    expect(relinkWarnings).toHaveLength(0);
  });
});

// ===========================================================================
// P5-07 — ADD-001/ADD-003: scaffold cleanup on partial failure
// ===========================================================================

describe('ADD-001 scaffold cleanup on partial failure', () => {
  it('cleanup succeeds: partial dir removed, original error reported, success=false', async () => {
    tmpDir = createWorkspace('add001-cleanup-ok');

    const toolPath = join(tmpDir, 'tools', 'react-app');
    // Create a templates/ dir so runScaffold calls renderAndCopy
    mkdirSync(join(toolPath, 'templates'), { recursive: true });

    const scaffoldConfig = {
      name: 'react-app',
      kind: 'none' as const,
      customizable: false,
      prototools: {},
      scaffold: {
        type: 'app' as const,
        devtools: [],
        moonTasks: [],
      },
    } satisfies ToolConfig;

    const toolMap: ToolMap = { 'react-app': makeDiscoveredTool('react-app', toolPath) };
    vi.mocked(scanAllTools).mockReturnValue(toolMap);
    vi.mocked(resolveTool).mockReturnValue(toolMap['react-app']);
    vi.mocked(loadToolConfig).mockReturnValue({ success: true, data: scaffoldConfig });

    // renderAndCopy creates the targetDir (simulating partial write) then throws
    const expectedTargetDir = join(tmpDir, 'apps', 'my-app');
    vi.mocked(renderAndCopy).mockImplementation(async () => {
      mkdirSync(expectedTargetDir, { recursive: true });
      throw new Error('Template render failed');
    });

    // fse.remove succeeds — cleanup works
    vi.mocked(fse.remove).mockResolvedValue(undefined);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runScaffold({
      toolName: 'react-app',
      name: 'my-app',
      json: true,
      cwd: tmpDir,
    });

    // Result must be failure
    expect(result.success).toBe(false);

    // JSON output must contain the original error
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Template render failed');
    // manualCleanupRequired must NOT be present (cleanup succeeded)
    expect(parsed.manualCleanupRequired).toBeUndefined();
  });

  it('cleanup fails: both errors reported, manualCleanupRequired=true, success=false', async () => {
    tmpDir = createWorkspace('add001-cleanup-fail');

    const toolPath = join(tmpDir, 'tools', 'react-app');
    // Create a templates/ dir so runScaffold calls renderAndCopy
    mkdirSync(join(toolPath, 'templates'), { recursive: true });

    const scaffoldConfig = {
      name: 'react-app',
      kind: 'none' as const,
      customizable: false,
      prototools: {},
      scaffold: {
        type: 'app' as const,
        devtools: [],
        moonTasks: [],
      },
    } satisfies ToolConfig;

    const toolMap: ToolMap = { 'react-app': makeDiscoveredTool('react-app', toolPath) };
    vi.mocked(scanAllTools).mockReturnValue(toolMap);
    vi.mocked(resolveTool).mockReturnValue(toolMap['react-app']);
    vi.mocked(loadToolConfig).mockReturnValue({ success: true, data: scaffoldConfig });

    // renderAndCopy creates the targetDir (simulating partial write) then throws
    const expectedTargetDir = join(tmpDir, 'apps', 'my-app');
    vi.mocked(renderAndCopy).mockImplementation(async () => {
      mkdirSync(expectedTargetDir, { recursive: true });
      throw new Error('Template render failed');
    });

    // fse.remove throws — cleanup also fails
    vi.mocked(fse.remove).mockRejectedValue(new Error('Permission denied'));

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await runScaffold({
      toolName: 'react-app',
      name: 'my-app',
      json: true,
      cwd: tmpDir,
    });

    // Result must be failure
    expect(result.success).toBe(false);

    // JSON output must contain both errors and manualCleanupRequired=true
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Template render failed');
    expect(parsed.cleanupError).toBe('Permission denied');
    expect(parsed.manualCleanupRequired).toBe(true);
    expect(typeof parsed.partialPath).toBe('string');
  });
});
