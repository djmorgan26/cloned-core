import type { VaultProvider } from './types.js';
import { FileVaultProvider } from './file-provider.js';
import { DevVaultProvider } from './dev-provider.js';

export type { VaultProvider };

let _activeProvider: VaultProvider | null = null;

/**
 * Get the active vault provider, defaulting to a file-backed dev vault.
 * The file vault persists across process restarts (unlike the in-memory DevVaultProvider).
 */
export function getVaultProvider(vaultFilePath?: string): VaultProvider {
  if (!_activeProvider) {
    const path = vaultFilePath ?? `${process.cwd()}/.cloned/vault.dev.json`;
    _activeProvider = new FileVaultProvider(path);
  }
  return _activeProvider;
}

export function setVaultProvider(provider: VaultProvider): void {
  _activeProvider = provider;
}

export async function initVaultProvider(
  providerName: string,
  opts?: { filePath?: string },
): Promise<VaultProvider> {
  switch (providerName) {
    case 'dev':
      // In-memory only – suitable for tests where disk persistence would be harmful
      _activeProvider = new DevVaultProvider();
      break;
    case 'file':
      _activeProvider = new FileVaultProvider(
        opts?.filePath ?? `${process.cwd()}/.cloned/vault.dev.json`,
      );
      break;
    case 'azure':
      // Azure Key Vault – requires @azure/keyvault-secrets and @azure/identity
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

/** For testing only – resets the active provider so tests get a fresh one. */
export function _resetVaultProvider(): void {
  _activeProvider = null;
}
