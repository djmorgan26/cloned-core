/**
 * Development-only local vault provider.
 * Stores secrets in an in-memory map with a warning.
 * NEVER use in production.
 */
import { logger } from '../shared/logger.js';
import type { VaultProvider } from './types.js';

export class DevVaultProvider implements VaultProvider {
  name = 'dev';
  private store = new Map<string, string>();

  constructor() {
    logger.warn(
      'DEV VAULT PROVIDER ACTIVE – secrets stored in memory only. ' +
        'Configure Azure Key Vault for production use.',
    );
  }

  async setSecret(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async getSecret(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async deleteSecret(key: string): Promise<void> {
    this.store.delete(key);
  }

  async listSecrets(): Promise<Array<{ name: string; lastModified?: string }>> {
    return Array.from(this.store.keys()).map((name) => ({ name }));
  }

  async status(): Promise<{ healthy: boolean; provider: string; message?: string }> {
    return {
      healthy: true,
      provider: 'dev',
      message: 'Development in-memory vault – not for production',
    };
  }
}

let _devVault: DevVaultProvider | null = null;

export function getDevVault(): DevVaultProvider {
  if (!_devVault) _devVault = new DevVaultProvider();
  return _devVault;
}
