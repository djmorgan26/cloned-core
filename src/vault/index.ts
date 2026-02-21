import type { VaultProvider } from './types.js';
import { DevVaultProvider } from './dev-provider.js';

export type { VaultProvider };

let _activeProvider: VaultProvider | null = null;

export function getVaultProvider(): VaultProvider {
  if (!_activeProvider) {
    _activeProvider = new DevVaultProvider();
  }
  return _activeProvider;
}

export function setVaultProvider(provider: VaultProvider): void {
  _activeProvider = provider;
}

export async function initVaultProvider(providerName: string): Promise<VaultProvider> {
  switch (providerName) {
    case 'dev':
      _activeProvider = new DevVaultProvider();
      break;
    case 'azure':
      // Azure Key Vault provider – requires @azure/keyvault-secrets and @azure/identity
      // Dynamically import to avoid hard dependency for users who don't need it
      try {
        const { AzureKeyVaultProvider } = await import('./azure-provider.js');
        _activeProvider = new AzureKeyVaultProvider();
      } catch {
        throw new Error(
          'Azure Key Vault provider not available. ' +
            'Install @azure/keyvault-secrets and @azure/identity packages.',
        );
      }
      break;
    default:
      throw new Error(`Unknown vault provider: ${providerName}`);
  }
  return _activeProvider;
}
