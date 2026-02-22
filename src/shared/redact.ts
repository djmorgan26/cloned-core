import { createHash, createHmac } from 'node:crypto';

// Patterns that indicate secret values (never log these)
const SECRET_PATTERNS = [
  /bearer\s+\S+/gi,
  /authorization:\s*\S+/gi,
  /token['":\s]+['"]?[A-Za-z0-9_\-./]{20,}['"]?/gi,
  /secret['":\s]+['"]?[A-Za-z0-9_\-./]{8,}['"]?/gi,
  /password['":\s]+['"]?\S+['"]?/gi,
  /key['":\s]+['"]?[A-Za-z0-9_\-./]{16,}['"]?/gi,
];

/**
 * Redact potential secret values from a string for safe logging.
 */
export function redact(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, '[REDACTED]');
  }
  return output;
}

/**
 * Compute a salted hash of a value for correlation without storing the raw value.
 * @param value - the value to hash
 * @param salt - workspace-level salt (never stored as secret, just for domain separation)
 */
export function saltedHash(value: string, salt: string): string {
  return createHmac('sha256', salt).update(value).digest('hex');
}

/**
 * SHA-256 hash of a canonical JSON representation of an object.
 */
export function jsonHash(obj: unknown): string {
  const replacer =
    obj !== null && typeof obj === 'object' && !Array.isArray(obj)
      ? Object.keys(obj as Record<string, unknown>).sort()
      : undefined;
  const canonical = JSON.stringify(obj, replacer) ?? 'null';
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Safely stringify an object, redacting known secret keys.
 */
export function safeStringify(obj: unknown, space?: number): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      if (
        typeof value === 'string' &&
        /^(token|secret|password|key|authorization|bearer)$/i.test(_key)
      ) {
        return '[REDACTED]';
      }
      return value;
    },
    space,
  );
}
