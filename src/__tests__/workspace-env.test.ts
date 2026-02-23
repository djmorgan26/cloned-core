import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadWorkspaceEnv, persistAzureWorkspaceEnv } from '../workspace/env.js';

const AZURE_KEYS = ['AZURE_KEYVAULT_URI', 'AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_CLIENT_SECRET'] as const;

describe('workspace env helpers', () => {
  let repoRoot: string;
  let workspaceRoot: string;
  let previousAzure: Record<string, string | undefined> = {};

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'cloned-repo-env-'));
    workspaceRoot = join(repoRoot, '.cloned');
    mkdirSync(workspaceRoot);
    previousAzure = {};
    for (const key of AZURE_KEYS) {
      previousAzure[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of AZURE_KEYS) {
      const value = previousAzure[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('persists Azure credentials and reloads them into process.env', () => {
    const envPath = persistAzureWorkspaceEnv(workspaceRoot, {
      keyvaultUri: 'https://my-vault.vault.azure.net/',
      clientId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      clientSecret: 'secret-value',
    });
    expect(existsSync(envPath)).toBe(true);
    const stored = JSON.parse(readFileSync(envPath, 'utf8'));
    expect(stored.azure).toBeDefined();

    loadWorkspaceEnv(repoRoot);

    expect(process.env['AZURE_KEYVAULT_URI']).toBe('https://my-vault.vault.azure.net/');
    expect(process.env['AZURE_CLIENT_ID']).toBe('11111111-1111-1111-1111-111111111111');
    expect(process.env['AZURE_TENANT_ID']).toBe('22222222-2222-2222-2222-222222222222');
    expect(process.env['AZURE_CLIENT_SECRET']).toBe('secret-value');
  });
});
