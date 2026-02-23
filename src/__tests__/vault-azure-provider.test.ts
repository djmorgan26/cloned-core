import { describe, it, expect } from '@jest/globals';
import { sanitizeAzureSecretName } from '../vault/azure-provider.js';

describe('sanitizeAzureSecretName', () => {
  it('replaces dots and underscores with hyphens', () => {
    expect(sanitizeAzureSecretName('llm.api_key')).toBe('llm-api-key');
  });

  it('collapses consecutive invalid characters and trims edges', () => {
    expect(sanitizeAzureSecretName('  github.oauth.access_token  ')).toBe('github-oauth-access-token');
    expect(sanitizeAzureSecretName('***api***key***')).toBe('api-key');
  });

  it('falls back to a default when the key is empty after sanitization', () => {
    expect(sanitizeAzureSecretName('---')).toBe('secret');
    expect(sanitizeAzureSecretName('   ')).toBe('secret');
  });
});
