import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { stringify } from 'yaml';

import { listCommand } from './list.js';

function writeYaml(filePath: string, data: Record<string, unknown>): void {
  writeFileSync(filePath, stringify(data), 'utf-8');
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `list-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  writeYaml(join(tmpDir, 'aikuora.workspace.yml'), {
    name: 'test-ws',
    scope: '@test',
    structure: { apps: 'apps', packages: 'packages', modules: 'modules', tools: 'tools' },
    defaults: { node: 'lts', pnpm: 'latest', python: '3.12.x', uv: 'latest' },
    customTools: [],
  });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function addProject(
  dir: string,
  name: string,
  kind: string,
  tools: string[] = []
): void {
  const projectDir = join(tmpDir, dir, name);
  mkdirSync(projectDir, { recursive: true });
  writeYaml(join(projectDir, 'aikuora.project.yml'), {
    kind,
    name,
    tools,
    dependencies: [],
  });
}

describe('listCommand', () => {
  it('returns failure with clear error when type is invalid (JSON)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await listCommand({ type: 'unknown-type', json: true, cwd: tmpDir });

    expect(result.success).toBe(false);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Valid types are: tools, apps, packages, modules');
  });

  it('returns failure with error message when type is invalid (human mode)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await listCommand({ type: 'invalid', json: false, cwd: tmpDir });

    expect(result.success).toBe(false);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('lists apps when type=apps (JSON)', async () => {
    addProject('apps', 'web', 'app');
    addProject('apps', 'admin', 'app');
    // Add a package (should not appear in apps list)
    addProject('packages', 'ui', 'package');

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await listCommand({ type: 'apps', json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.type).toBe('apps');
    const items = parsed.items as Array<{ path: string; kind: string }>;
    expect(items).toHaveLength(2);
    const paths = items.map((i) => i.path);
    expect(paths).toContain('apps/web');
    expect(paths).toContain('apps/admin');
  });

  it('lists packages including shareable when type=packages (JSON)', async () => {
    addProject('packages', 'ui', 'package');
    addProject('packages', 'configs', 'shareable');
    addProject('apps', 'web', 'app'); // should not appear

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await listCommand({ type: 'packages', json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    const items = parsed.items as Array<{ path: string; kind: string }>;
    expect(items).toHaveLength(2);
    const paths = items.map((i) => i.path);
    expect(paths).toContain('packages/ui');
    expect(paths).toContain('packages/configs');
    expect(paths).not.toContain('apps/web');
  });

  it('lists modules when type=modules (JSON)', async () => {
    addProject('modules', 'auth', 'module');
    addProject('apps', 'web', 'app'); // should not appear

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await listCommand({ type: 'modules', json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    const items = parsed.items as Array<{ path: string; kind: string }>;
    expect(items).toHaveLength(1);
    expect(items[0].path).toBe('modules/auth');
  });

  it('excludes root tool installations (no aikuora.project.yml) from list (JSON)', async () => {
    // A directory without a project file is silently skipped
    const rootOnlyDir = join(tmpDir, 'apps', 'root-install');
    mkdirSync(rootOnlyDir, { recursive: true });
    // Deliberately no aikuora.project.yml

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await listCommand({ type: 'apps', json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.items).toEqual([]);
  });

  it('returns failure with structured JSON when no workspace exists (JSON)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const emptyDir = join(tmpdir(), `list-no-ws-${Date.now()}`);
    mkdirSync(emptyDir, { recursive: true });

    try {
      const result = await listCommand({ type: 'apps', json: true, cwd: emptyDir });

      expect(result.success).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
      expect(parsed.success).toBe(false);
      expect(typeof parsed.error).toBe('string');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('lists tools when type=tools (JSON)', async () => {
    // This test uses built-in tool discovery; we just verify the shape
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await listCommand({ type: 'tools', json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.type).toBe('tools');
    expect(Array.isArray(parsed.items)).toBe(true);
  });
});
