/**
 * Azure Key Vault provider (BYOV).
 * Requires @azure/keyvault-secrets and @azure/identity packages.
 * Connection details come from environment:
 *   AZURE_KEYVAULT_URI  - Vault URI (https://<name>.vault.azure.net/)
 *   AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET - or DefaultAzureCredential
 */
import type { VaultProvider } from './types.js';

export class AzureKeyVaultProvider implements VaultProvider {
  name = 'azure';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  private async getClient() {
    if (this.client) return this.client;

    const vaultUri = process.env['AZURE_KEYVAULT_URI'];
    if (!vaultUri) {
      throw new Error('AZURE_KEYVAULT_URI environment variable is required for Azure vault provider');
    }

    // Dynamic imports to avoid bundling issues
    const { SecretClient } = await import('@azure/keyvault-secrets' as string);
    const { DefaultAzureCredential } = await import('@azure/identity' as string);

    this.client = new SecretClient(vaultUri, new DefaultAzureCredential());
    return this.client;
  }

  async setSecret(key: string, value: string): Promise<void> {
    const client = await this.getClient();
    await client.setSecret(key, value);
  }

  async getSecret(key: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      const secret = await client.getSecret(key);
      return secret.value ?? null;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'SecretNotFound') return null;
      throw err;
    }
  }

  async deleteSecret(key: string): Promise<void> {
    const client = await this.getClient();
    await client.beginDeleteSecret(key);
  }

  async listSecrets(): Promise<Array<{ name: string; lastModified?: string }>> {
    const client = await this.getClient();
    const results: Array<{ name: string; lastModified?: string }> = [];
    for await (const secret of client.listPropertiesOfSecrets()) {
      results.push({
        name: secret.name,
        lastModified: secret.updatedOn?.toISOString(),
      });
    }
    return results;
  }

  async status(): Promise<{ healthy: boolean; provider: string; message?: string }> {
    try {
      const client = await this.getClient();
      // Try listing secrets as a health check (lightweight)
      const iter = client.listPropertiesOfSecrets();
      await iter.next();
      return { healthy: true, provider: 'azure' };
    } catch (err: unknown) {
      return {
        healthy: false,
        provider: 'azure',
        message: (err as Error).message,
      };
    }
  }
}
