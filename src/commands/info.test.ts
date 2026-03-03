import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { stringify } from 'yaml';

import { infoCommand } from './info.js';

function writeYaml(filePath: string, data: Record<string, unknown>): void {
  writeFileSync(filePath, stringify(data), 'utf-8');
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `info-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  // Write a minimal valid aikuora.workspace.yml
  writeYaml(join(tmpDir, 'aikuora.workspace.yml'), {
    name: 'acme-mono',
    scope: '@acme',
    structure: { apps: 'apps', packages: 'packages', modules: 'modules', tools: 'tools' },
    defaults: { node: 'lts', pnpm: 'latest', python: '3.12.x', uv: 'latest' },
    customTools: [],
  });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('infoCommand', () => {
  it('returns workspace name and scope with no projects and no prototools (JSON)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await infoCommand({ json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.action).toBe('info');
    expect(parsed.success).toBe(true);
    expect(parsed.workspace).toEqual({ name: 'acme-mono', scope: '@acme' });
    expect(parsed.projects).toEqual([]);
    expect(parsed.runtimePins).toBeUndefined();
  });

  it('includes projects with their kind and tools (JSON)', async () => {
    // Create apps/web project
    const webDir = join(tmpDir, 'apps', 'web');
    mkdirSync(webDir, { recursive: true });
    writeYaml(join(webDir, 'aikuora.project.yml'), {
      kind: 'app',
      name: 'web',
      tools: ['prettier'],
      dependencies: [],
    });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await infoCommand({ json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    const projects = parsed.projects as Array<{ path: string; kind: string; tools: string[] }>;
    expect(projects).toHaveLength(1);
    expect(projects[0].path).toBe('apps/web');
    expect(projects[0].kind).toBe('app');
    expect(projects[0].tools).toEqual(['prettier']);
  });

  it('includes runtimePins when .prototools exists (JSON)', async () => {
    writeFileSync(join(tmpDir, '.prototools'), 'node = "22.0.0"\n', 'utf-8');

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await infoCommand({ json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.runtimePins).toEqual({ node: '22.0.0' });
  });

  it('omits runtimePins when .prototools does not exist (JSON)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await infoCommand({ json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect('runtimePins' in parsed).toBe(false);
  });

  it('does not show root tool installations as projects (JSON)', async () => {
    // Root tool installs have NO aikuora.project.yml, so they are naturally excluded.
    // A dir inside apps/ without a project file should not appear.
    const rootToolDir = join(tmpDir, 'apps', 'root-only');
    mkdirSync(rootToolDir, { recursive: true });
    // Deliberately do NOT write an aikuora.project.yml here

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await infoCommand({ json: true, cwd: tmpDir });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.projects).toEqual([]);
  });

  it('returns failure when no workspace config is found (JSON)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const emptyDir = join(tmpdir(), `info-no-ws-${Date.now()}`);
    mkdirSync(emptyDir, { recursive: true });

    try {
      const result = await infoCommand({ json: true, cwd: emptyDir });

      expect(result.success).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
      expect(parsed.success).toBe(false);
      expect(typeof parsed.error).toBe('string');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
