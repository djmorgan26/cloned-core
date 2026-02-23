import { createSign } from 'node:crypto';
import type { VaultProvider } from '../../vault/types.js';
import { getInstallationToken } from './auth.js';

export interface GitHubAppCredentials {
  appId: string;
  privateKey: string;
}

export interface CredentialOverrides {
  appId?: string;
  privateKey?: string;
}

export function createGitHubAppJwt(appId: string, privateKey: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const body = `${encode(header)}.${encode(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  return `${body}.${signature}`;
}

export function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('\\n') && !trimmed.includes('\n')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  return trimmed;
}

export async function loadGitHubAppCredentials(
  vault: VaultProvider,
  overrides?: CredentialOverrides,
): Promise<GitHubAppCredentials | null> {
  const appId = overrides?.appId
    ?? (await vault.getSecret('github.app.id'))
    ?? process.env['GITHUB_APP_ID'];

  let privateKey = overrides?.privateKey
    ?? (await vault.getSecret('github.app.private_key'))
    ?? process.env['GITHUB_APP_PRIVATE_KEY'];

  if (!appId || !privateKey) return null;
  return {
    appId: appId.trim(),
    privateKey: normalizePrivateKey(privateKey),
  };
}

export async function fetchInstallationAccessToken(params: {
  vault: VaultProvider;
  installationId: number;
  overrides?: CredentialOverrides;
}): Promise<{ token: string; expires_at: string }> {
  const creds = await loadGitHubAppCredentials(params.vault, params.overrides);
  if (!creds) {
    throw new Error('GitHub App credentials not configured');
  }
  const jwt = createGitHubAppJwt(creds.appId, creds.privateKey);
  return getInstallationToken(jwt, params.installationId);
}
