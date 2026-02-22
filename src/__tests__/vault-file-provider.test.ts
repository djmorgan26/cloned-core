import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileVaultProvider } from '../vault/file-provider.js';

describe('FileVaultProvider', () => {
  let tmpDir: string;
  let vaultPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cloned-vault-test-'));
    vaultPath = join(tmpDir, 'vault.dev.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('set and get a secret', async () => {
    const vault = new FileVaultProvider(vaultPath);
    await vault.setSecret('test.key', 'test-value');
    expect(await vault.getSecret('test.key')).toBe('test-value');
  });

  it('returns null for missing secret', async () => {
    const vault = new FileVaultProvider(vaultPath);
    expect(await vault.getSecret('nonexistent')).toBeNull();
  });

  it('deletes a secret', async () => {
    const vault = new FileVaultProvider(vaultPath);
    await vault.setSecret('key', 'value');
    await vault.deleteSecret('key');
    expect(await vault.getSecret('key')).toBeNull();
  });

  it('persists across re-instantiation', async () => {
    const vault1 = new FileVaultProvider(vaultPath);
    await vault1.setSecret('persistent.key', 'persistent-value');

    const vault2 = new FileVaultProvider(vaultPath);
    expect(await vault2.getSecret('persistent.key')).toBe('persistent-value');
  });

  it('lists secrets without values', async () => {
    const vault = new FileVaultProvider(vaultPath);
    await vault.setSecret('key1', 'v1');
    await vault.setSecret('key2', 'v2');
    const secrets = await vault.listSecrets();
    expect(secrets.map((s) => s.name).sort()).toEqual(['key1', 'key2']);
  });

  it('returns healthy status', async () => {
    const vault = new FileVaultProvider(vaultPath);
    const status = await vault.status();
    expect(status.healthy).toBe(true);
    expect(status.provider).toBe('file');
  });

  it('survives a corrupted vault file', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(vaultPath, 'NOT VALID JSON', 'utf8');
    const vault = new FileVaultProvider(vaultPath);
    expect(await vault.getSecret('anything')).toBeNull();
  });
});
