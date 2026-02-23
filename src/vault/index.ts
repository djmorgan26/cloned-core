import type { VaultProvider } from './types.js';
import { FileVaultProvider } from './file-provider.js';
import { DevVaultProvider } from './dev-provider.js';
import { AzureKeyVaultProvider } from './azure-provider.js';

export type { VaultProvider };

export type VaultProviderName = 'dev' | 'file' | 'azure';

export interface VaultProviderOptions {
  provider?: VaultProviderName | string;
  filePath?: string;
}

let _activeProvider: VaultProvider | null = null;
let _activeKey: string | null = null;

function resolveOptions(input?: string | VaultProviderOptions): VaultProviderOptions {
  if (typeof input === 'string') return { filePath: input };
  return input ?? {};
}

function cacheKey(provider: string, filePath: string): string {
  return provider === 'file' ? `${provider}:${filePath}` : provider;
}

/**
 * Get the active vault provider (cached). Defaults to the file provider backed by
 * `.cloned/vault.dev.json` so local development keeps working with zero config.
 */
export function getVaultProvider(input?: string | VaultProviderOptions): VaultProvider {
  const opts = resolveOptions(input);
  const provider = (opts.provider ?? process.env['CLONED_VAULT_PROVIDER'] ?? 'file') as string;
  const filePath = opts.filePath ?? `${process.cwd()}/.cloned/vault.dev.json`;
  const key = cacheKey(provider, filePath);

  if (_activeProvider && _activeKey === key) {
    return _activeProvider;
  }

  switch (provider) {
    case 'dev':
      _activeProvider = new DevVaultProvider();
      break;
    case 'file':
      _activeProvider = new FileVaultProvider(filePath);
      break;
    case 'azure':
      _activeProvider = new AzureKeyVaultProvider();
      break;
    default:
      throw new Error(`Unknown vault provider: ${provider}`);
  }

  _activeKey = key;
  return _activeProvider;
}

export function setVaultProvider(provider: VaultProvider, key?: string): void {
  _activeProvider = provider;
  _activeKey = key ?? null;
}

export async function initVaultProvider(
  providerName: string,
  opts?: { filePath?: string },
): Promise<VaultProvider> {
  // Backwards compatibility for existing callers
  return getVaultProvider({ provider: providerName, filePath: opts?.filePath });
}

/** For testing only – resets the active provider so tests get a fresh one. */
export function _resetVaultProvider(): void {
  _activeProvider = null;
  _activeKey = null;
}
