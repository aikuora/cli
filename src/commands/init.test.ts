import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initCommand } from './init.js';

describe('initCommand — INIT-001 derived tests', () => {
  let testDir: string;

  afterEach(() => {
    if (testDir) rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('INIT-001 nested workspace: fails when cwd is inside a directory containing aikuora.workspace.yml', async () => {
    // given: the current directory is inside a directory that contains an aikuora.workspace.yml
    testDir = mkdtempSync(join(tmpdir(), 'init-nested-'));
    writeFileSync(
      join(testDir, 'aikuora.workspace.yml'),
      'name: "parent-mono"\nscope: "@parent"\n',
      'utf-8'
    );

    const childDir = join(testDir, 'child');
    mkdirSync(childDir, { recursive: true });

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // when: developer runs aikuora init from a child dir inside the existing workspace
    const result = await initCommand({
      name: 'child',
      scope: '@child',
      cwd: childDir,
      json: true,
    });

    // then: no files are written; developer is informed with the spec-required message
    expect(result.success).toBe(false);

    const spy = vi.mocked(console.log);
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.success).toBe(false);
    expect(typeof parsed.error).toBe('string');
    expect(parsed.error as string).toMatch(
      /Cannot initialize workspace inside an existing aikuora workspace at/i
    );
  });
});
