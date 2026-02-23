import { createVerify, generateKeyPairSync } from 'node:crypto';
import type { VaultProvider } from '../vault/types.js';
import {
  createGitHubAppJwt,
  loadGitHubAppCredentials,
  normalizePrivateKey,
} from '../connector/github/app-auth.js';

describe('GitHub App auth helpers', () => {
  it('normalizes escaped newlines in private key', () => {
    const key = '-----BEGIN-----\\nabc\\n-----END-----';
    expect(normalizePrivateKey(key)).toBe('-----BEGIN-----\nabc\n-----END-----');
  });

  it('creates a signed JWT with expected payload fields', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });

    const jwt = createGitHubAppJwt('12345', privateKey);
    const segments = jwt.split('.');
    expect(segments).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(segments[1]!, 'base64url').toString('utf8')) as {
      iss: string;
      exp: number;
      iat: number;
    };
    expect(payload.iss).toBe('12345');
    expect(payload.exp - payload.iat).toBe(660);

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${segments[0]}.${segments[1]}`);
    verifier.end();
    const valid = verifier.verify(publicKey, segments[2]!, 'base64url');
    expect(valid).toBe(true);
  });

  it('loads credentials from vault fallback', async () => {
    const secrets: Record<string, string> = {
      'github.app.id': '6789',
      'github.app.private_key': 'key',
    };
    const vault: VaultProvider = {
      name: 'test',
      async setSecret() {},
      async getSecret(key: string) {
        return secrets[key] ?? null;
      },
      async deleteSecret() {},
      async listSecrets() {
        return [];
      },
      async status() {
        return { healthy: true, provider: 'test' };
      },
    };

    const creds = await loadGitHubAppCredentials(vault);
    expect(creds).not.toBeNull();
    expect(creds?.appId).toBe('6789');
    expect(creds?.privateKey).toBe('key');
  });
});
