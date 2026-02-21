/**
 * Azure Key Vault provider (BYOV – Bring Your Own Vault).
 *
 * Requires optional packages – install once:
 *   npm install @azure/keyvault-secrets @azure/identity
 *
 * Connection via environment variables (DefaultAzureCredential supports all auth modes):
 *   AZURE_KEYVAULT_URI      – required, e.g. https://<vault-name>.vault.azure.net/
 *   AZURE_CLIENT_ID         – for service principal / managed identity
 *   AZURE_TENANT_ID         – for service principal
 *   AZURE_CLIENT_SECRET     – for service principal
 *   (omit for workload identity / managed identity / az login)
 *
 * Key naming: Azure KV allows [a-zA-Z0-9-] only. We map internal dots (e.g.
 * "github.oauth.access_token") to hyphens ("github-oauth-access-token").
 */
import type { VaultProvider } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export class AzureKeyVaultProvider implements VaultProvider {
  readonly name = 'azure';
  private _client: AnyClient = null;

  private async client(): Promise<AnyClient> {
    if (this._client) return this._client;

    const vaultUri = process.env['AZURE_KEYVAULT_URI'];
    if (!vaultUri) {
      throw new Error(
        'AZURE_KEYVAULT_URI environment variable is required. ' +
          'Set it to your vault URI: https://<name>.vault.azure.net/',
      );
    }

    // Dynamic imports keep @azure packages as optional dependencies
    let SecretClient: AnyClient, DefaultAzureCredential: AnyClient;
    try {
      ({ SecretClient } = await import('@azure/keyvault-secrets' as string));
      ({ DefaultAzureCredential } = await import('@azure/identity' as string));
    } catch {
      throw new Error(
        'Azure Key Vault packages not installed. Run:\n' +
          '  npm install @azure/keyvault-secrets @azure/identity',
      );
    }

    this._client = new SecretClient(vaultUri, new DefaultAzureCredential());
    return this._client;
  }

  /** Azure KV secret names: alphanumeric + hyphens only. Map dots to hyphens. */
  private sanitizeKey(key: string): string {
    return key.replace(/\./g, '-').replace(/[^a-zA-Z0-9-]/g, '_');
  }

  async setSecret(key: string, value: string): Promise<void> {
    const c = await this.client();
    await c.setSecret(this.sanitizeKey(key), value);
  }

  async getSecret(key: string): Promise<string | null> {
    try {
      const c = await this.client();
      const secret = await c.getSecret(this.sanitizeKey(key));
      return secret.value ?? null;
    } catch (err: unknown) {
      const code = (err as { code?: string; statusCode?: number }).code;
      const status = (err as { statusCode?: number }).statusCode;
      if (code === 'SecretNotFound' || status === 404) return null;
      throw err;
    }
  }

  async deleteSecret(key: string): Promise<void> {
    const c = await this.client();
    // beginDeleteSecret returns a poller; we don't await the purge, just initiate
    await c.beginDeleteSecret(this.sanitizeKey(key));
  }

  async listSecrets(): Promise<Array<{ name: string; lastModified?: string }>> {
    const c = await this.client();
    const results: Array<{ name: string; lastModified?: string }> = [];
    for await (const props of c.listPropertiesOfSecrets()) {
      results.push({
        name: props.name as string,
        lastModified: (props.updatedOn as Date | undefined)?.toISOString(),
      });
    }
    return results;
  }

  async status(): Promise<{ healthy: boolean; provider: string; message?: string }> {
    try {
      const c = await this.client();
      // Lightweight check: begin listing and immediately stop
      const iter = c.listPropertiesOfSecrets();
      await iter.next();
      const uri = process.env['AZURE_KEYVAULT_URI'] ?? 'unknown';
      return { healthy: true, provider: 'azure', message: `Connected to ${uri}` };
    } catch (err: unknown) {
      return {
        healthy: false,
        provider: 'azure',
        message: (err as Error).message,
      };
    }
  }
}
