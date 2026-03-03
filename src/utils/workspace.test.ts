import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateWorkspace } from './workspace.js';

const TEMP_DIR = join(process.cwd(), '.test-workspace-tmp');

function setup(): void {
  mkdirSync(TEMP_DIR, { recursive: true });
}

function teardown(): void {
  rmSync(TEMP_DIR, { recursive: true, force: true });
}

function writeConfig(content: string): void {
  writeFileSync(join(TEMP_DIR, 'aikuora.workspace.yml'), content, 'utf-8');
}

describe('validateWorkspace', () => {
  beforeEach(setup);
  afterEach(teardown);

  describe('missing config file', () => {
    it('returns valid=false with a clear error when no config file is found', () => {
      // TEMP_DIR exists but has no aikuora.workspace.yml
      const result = validateWorkspace(TEMP_DIR);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/no aikuora\.workspace\.yml found/i);
      }
    });
  });

  describe('invalid YAML', () => {
    it('returns valid=false when the config file contains malformed YAML', () => {
      writeConfig(': this is: not: valid: yaml: :::');

      const result = validateWorkspace(TEMP_DIR);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/invalid yaml/i);
      }
    });
  });

  describe('schema validation failures', () => {
    it('returns valid=false naming the name field when name is empty', () => {
      writeConfig('name: ""\nscope: "@acme"\n');

      const result = validateWorkspace(TEMP_DIR);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/name/i);
      }
    });

    it('returns valid=false naming the name field when name is absent', () => {
      writeConfig('scope: "@acme"\n');

      const result = validateWorkspace(TEMP_DIR);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/name/i);
      }
    });

    it('returns valid=false naming the scope field when scope does not match regex', () => {
      writeConfig('name: "acme-mono"\nscope: "INVALID_SCOPE"\n');

      const result = validateWorkspace(TEMP_DIR);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/scope/i);
      }
    });

    it('returns valid=false naming the scope field when scope is absent', () => {
      writeConfig('name: "acme-mono"\n');

      const result = validateWorkspace(TEMP_DIR);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/scope/i);
      }
    });
  });

  describe('valid config', () => {
    it('returns valid=true with the parsed config when name and scope are correct', () => {
      writeConfig('name: "acme-mono"\nscope: "@acme"\n');

      const result = validateWorkspace(TEMP_DIR);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.config.name).toBe('acme-mono');
        expect(result.config.scope).toBe('@acme');
      }
    });

    it('accepts scope with numbers and hyphens', () => {
      writeConfig('name: "my-project"\nscope: "@my-org-123"\n');

      const result = validateWorkspace(TEMP_DIR);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.config.scope).toBe('@my-org-123');
      }
    });

    it('walks up from a child directory to find the config', () => {
      writeConfig('name: "acme-mono"\nscope: "@acme"\n');

      const childDir = join(TEMP_DIR, 'apps', 'my-app');
      mkdirSync(childDir, { recursive: true });

      const result = validateWorkspace(childDir);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.config.name).toBe('acme-mono');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// STARTUP-001 derived_tests: isolated temp dirs using os.tmpdir()
// ---------------------------------------------------------------------------

describe('validateWorkspace — STARTUP-001 derived tests', () => {
  let testDir: string;

  afterEach(() => {
    if (testDir) rmSync(testDir, { recursive: true, force: true });
  });

  it('STARTUP-001 invalid scope: returns valid=false with scope error when scope=INVALID', () => {
    // given: aikuora.workspace.yml exists with scope=INVALID (not matching /^@[a-z0-9-]+$/)
    testDir = mkdtempSync(join(tmpdir(), 'startup-001-invalid-scope-'));
    writeFileSync(
      join(testDir, 'aikuora.workspace.yml'),
      'name: "acme-mono"\nscope: "INVALID"\n',
      'utf-8'
    );

    // when: developer runs any aikuora command (validateWorkspace is called)
    const result = validateWorkspace(testDir);

    // then: command does not execute; error describes invalid scope field; exit code 1
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/scope/i);
    }
  });

  it('STARTUP-001 happy path: returns valid=true when scope=@acme and name=acme-mono', () => {
    // given: aikuora.workspace.yml exists with scope=@acme and name=acme-mono
    testDir = mkdtempSync(join(tmpdir(), 'startup-001-happy-'));
    writeFileSync(
      join(testDir, 'aikuora.workspace.yml'),
      'name: "acme-mono"\nscope: "@acme"\n',
      'utf-8'
    );

    // when: developer runs any aikuora command (validateWorkspace is called)
    const result = validateWorkspace(testDir);

    // then: validation passes and command proceeds normally
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.name).toBe('acme-mono');
      expect(result.config.scope).toBe('@acme');
    }
  });

  it('STARTUP-001 missing name: returns valid=false with name error when name field is absent', () => {
    // given: aikuora.workspace.yml exists with scope=@acme but name field is absent
    testDir = mkdtempSync(join(tmpdir(), 'startup-001-missing-name-'));
    writeFileSync(
      join(testDir, 'aikuora.workspace.yml'),
      'scope: "@acme"\n',
      'utf-8'
    );

    // when: developer runs any aikuora command (validateWorkspace is called)
    const result = validateWorkspace(testDir);

    // then: command does not execute; error states name field is required; exit code 1
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/name/i);
    }
  });
});
