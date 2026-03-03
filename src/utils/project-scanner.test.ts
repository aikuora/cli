import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { stringify } from 'yaml';

import type { Config } from '../types/config.js';
import { scanProjects } from './project-scanner.js';

function makeStructure(overrides?: Partial<Config['structure']>): Config['structure'] {
  return {
    apps: 'apps',
    packages: 'packages',
    modules: 'modules',
    tools: 'tools',
    ...overrides,
  };
}

function writeProjectFile(dir: string, data: Record<string, unknown>): void {
  writeFileSync(join(dir, 'aikuora.project.yml'), stringify(data), 'utf-8');
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `project-scanner-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('scanProjects', () => {
  it('returns [] when structure dirs do not exist', () => {
    const result = scanProjects(tmpDir, makeStructure());
    expect(result).toEqual([]);
  });

  it('returns [] when structure dirs are empty', () => {
    mkdirSync(join(tmpDir, 'apps'));
    mkdirSync(join(tmpDir, 'packages'));
    mkdirSync(join(tmpDir, 'modules'));
    const result = scanProjects(tmpDir, makeStructure());
    expect(result).toEqual([]);
  });

  it('skips subdirs without a project file', () => {
    const appsDir = join(tmpDir, 'apps');
    mkdirSync(appsDir);
    mkdirSync(join(appsDir, 'web'));
    const result = scanProjects(tmpDir, makeStructure());
    expect(result).toEqual([]);
  });

  it('includes subdirs that have a valid project file', () => {
    const appsDir = join(tmpDir, 'apps');
    mkdirSync(appsDir);
    const webDir = join(appsDir, 'web');
    mkdirSync(webDir);
    writeProjectFile(webDir, { kind: 'app', name: 'web', tools: [], dependencies: [] });

    const result = scanProjects(tmpDir, makeStructure());
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('apps/web');
    expect(result[0].absPath).toBe(webDir);
    expect(result[0].projectFile.kind).toBe('app');
    expect(result[0].projectFile.name).toBe('web');
  });

  it('includes projects with kind=shareable', () => {
    const pkgsDir = join(tmpDir, 'packages');
    mkdirSync(pkgsDir);
    const configsDir = join(pkgsDir, 'configs');
    mkdirSync(configsDir);
    writeProjectFile(configsDir, { kind: 'shareable', name: 'configs', tools: [], dependencies: [] });

    const result = scanProjects(tmpDir, makeStructure());
    expect(result).toHaveLength(1);
    expect(result[0].projectFile.kind).toBe('shareable');
    expect(result[0].path).toBe('packages/configs');
  });

  it('scans multiple structure dirs and returns all valid projects', () => {
    const appsDir = join(tmpDir, 'apps');
    const pkgsDir = join(tmpDir, 'packages');
    const modsDir = join(tmpDir, 'modules');
    mkdirSync(appsDir);
    mkdirSync(pkgsDir);
    mkdirSync(modsDir);

    const webDir = join(appsDir, 'web');
    mkdirSync(webDir);
    writeProjectFile(webDir, { kind: 'app', name: 'web', tools: [], dependencies: [] });

    const uiDir = join(pkgsDir, 'ui');
    mkdirSync(uiDir);
    writeProjectFile(uiDir, { kind: 'package', name: 'ui', tools: [], dependencies: [] });

    const coreDir = join(modsDir, 'core');
    mkdirSync(coreDir);
    writeProjectFile(coreDir, { kind: 'module', name: 'core', tools: [], dependencies: [] });

    const result = scanProjects(tmpDir, makeStructure());
    expect(result).toHaveLength(3);

    const paths = result.map((r) => r.path);
    expect(paths).toContain('apps/web');
    expect(paths).toContain('packages/ui');
    expect(paths).toContain('modules/core');
  });

  it('skips files (non-directories) inside structure dirs', () => {
    const appsDir = join(tmpDir, 'apps');
    mkdirSync(appsDir);
    writeFileSync(join(appsDir, 'README.md'), '# apps', 'utf-8');
    const result = scanProjects(tmpDir, makeStructure());
    expect(result).toEqual([]);
  });

  it('skips a subdir with an invalid project file', () => {
    const appsDir = join(tmpDir, 'apps');
    mkdirSync(appsDir);
    const badDir = join(appsDir, 'bad');
    mkdirSync(badDir);
    // Invalid YAML content — not a valid project file
    writeFileSync(join(badDir, 'aikuora.project.yml'), 'invalid: yaml: :::', 'utf-8');
    const result = scanProjects(tmpDir, makeStructure());
    expect(result).toEqual([]);
  });
});
