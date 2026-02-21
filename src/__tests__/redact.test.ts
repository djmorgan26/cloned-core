import { describe, it, expect } from '@jest/globals';
import { redact, saltedHash, jsonHash, safeStringify } from '../shared/redact.js';

describe('Redaction', () => {
  it('redacts bearer tokens', () => {
    const input = 'Authorization: Bearer fake-bearer-token-not-real-abc';
    const result = redact(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('fake-bearer-token-not-real-abc');
  });

  it('redacts token values', () => {
    const input = '{"token": "fake-token-value-for-testing-only-xyz"}';
    const result = redact(input);
    expect(result).toContain('[REDACTED]');
  });

  it('computes consistent salted hashes', () => {
    const h1 = saltedHash('secret', 'salt');
    const h2 = saltedHash('secret', 'salt');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different salts', () => {
    const h1 = saltedHash('secret', 'salt1');
    const h2 = saltedHash('secret', 'salt2');
    expect(h1).not.toBe(h2);
  });

  it('computes stable JSON hash', () => {
    const obj = { a: 1, b: 'hello' };
    const h1 = jsonHash(obj);
    const h2 = jsonHash(obj);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it('safeStringify redacts secret keys', () => {
    const obj = { token: 'super_secret_value', name: 'Alice' };
    const json = safeStringify(obj);
    expect(json).not.toContain('super_secret_value');
    expect(json).toContain('[REDACTED]');
    expect(json).toContain('Alice');
  });
});
