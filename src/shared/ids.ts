import { randomBytes } from 'node:crypto';

/**
 * Generate a URL-safe random ID of the given byte length (default 16 bytes -> 22 chars base64url).
 */
export function generateId(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}
