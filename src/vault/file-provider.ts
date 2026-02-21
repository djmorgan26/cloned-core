/**
 * File-backed development vault provider.
 * Persists secrets to .cloned/vault.dev.json (plaintext – dev only).
 *
 * WARNING: Do NOT use in production. Secrets are stored unencrypted on disk.
 * Configure Azure Key Vault for any real deployment.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { logger } from '../shared/logger.js';
import type { VaultProvider } from './types.js';

interface VaultStore {
  secrets: Record<string, { value: string; updatedAt: string }>;
}

export class FileVaultProvider implements VaultProvider {
  readonly name = 'file';
  private readonly filePath: string;
  private store: VaultStore;

  constructor(filePath: string) {
    this.filePath = filePath;

    logger.warn(
      'FILE VAULT PROVIDER ACTIVE – secrets stored in plaintext on disk. ' +
        'Configure Azure Key Vault for production use.',
      { path: filePath },
    );

    this.store = this.load();
  }

  private load(): VaultStore {
    if (!existsSync(this.filePath)) {
      return { secrets: {} };
    }
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw) as VaultStore;
    } catch {
      logger.warn('Vault file corrupted – starting fresh', { path: this.filePath });
      return { secrets: {} };
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  async setSecret(key: string, value: string): Promise<void> {
    this.store.secrets[key] = { value, updatedAt: new Date().toISOString() };
    this.persist();
  }

  async getSecret(key: string): Promise<string | null> {
    return this.store.secrets[key]?.value ?? null;
  }

  async deleteSecret(key: string): Promise<void> {
    delete this.store.secrets[key];
    this.persist();
  }

  async listSecrets(): Promise<Array<{ name: string; lastModified?: string }>> {
    return Object.entries(this.store.secrets).map(([name, entry]) => ({
      name,
      lastModified: entry.updatedAt,
    }));
  }

  async status(): Promise<{ healthy: boolean; provider: string; message?: string }> {
    return {
      healthy: true,
      provider: 'file',
      message: `Dev file vault at ${this.filePath} (plaintext – not for production)`,
    };
  }
}
