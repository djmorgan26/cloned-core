import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initWorkspace } from '../workspace/init.js';
import { _resetDb } from '../workspace/db.js';

describe('initWorkspace', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cloned-ws-init-'));
    _resetDb();
  });

  afterEach(() => {
    _resetDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .cloned/ directory structure', async () => {
    const config = await initWorkspace({ cwd: tmpDir, type: 'personal' });
    expect(existsSync(join(tmpDir, '.cloned'))).toBe(true);
    expect(existsSync(join(tmpDir, '.cloned/config.yaml'))).toBe(true);
    expect(existsSync(join(tmpDir, '.cloned/registry.yaml'))).toBe(true);
    expect(existsSync(join(tmpDir, '.cloned/state.db'))).toBe(true);
    expect(existsSync(join(tmpDir, '.cloned/audit.log'))).toBe(true);
    expect(config.type).toBe('personal');
    expect(config.workspace_id).toBeTruthy();
  });

  it('throws if workspace already exists without --force', async () => {
    await initWorkspace({ cwd: tmpDir, type: 'personal' });
    _resetDb();
    await expect(initWorkspace({ cwd: tmpDir, type: 'personal' })).rejects.toThrow('already exists');
  });

  it('reinitializes with --force', async () => {
    await initWorkspace({ cwd: tmpDir, type: 'personal' });
    _resetDb();
    const config = await initWorkspace({ cwd: tmpDir, type: 'shared', force: true });
    expect(config.type).toBe('shared');
  });
});
