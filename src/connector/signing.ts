/**
 * Ed25519 signature verification for connector packages.
 * Uses tweetnacl for pure-JS Ed25519.
 */
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
const { decodeBase64 } = naclUtil;
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  integrity_hash?: string;
}

export interface TrustRoot {
  publisher_id: string;
  public_key_base64: string;
  description?: string;
}

/**
 * Compute SHA-256 hash of a file's contents.
 */
export function fileHash(filePath: string): string {
  const contents = readFileSync(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

/**
 * Verify Ed25519 signature of a connector package.
 * @param packagePath - path to the package directory
 * @param trustRoots  - list of trusted publisher public keys
 */
export function verifyConnectorSignature(
  packagePath: string,
  trustRoots: TrustRoot[],
): VerificationResult {
  const manifestPath = join(packagePath, 'package.manifest.json');
  const sigPath = join(packagePath, 'package.sig');

  if (!existsSync(manifestPath)) {
    return { valid: false, reason: 'Missing package.manifest.json' };
  }
  if (!existsSync(sigPath)) {
    return { valid: false, reason: 'Missing package.sig – unsigned connector rejected' };
  }

  let manifest: { publisher_id?: string; integrity_hash?: string };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { valid: false, reason: 'Malformed package.manifest.json' };
  }

  if (!manifest.publisher_id) {
    return { valid: false, reason: 'Manifest missing publisher_id' };
  }

  const root = trustRoots.find((r) => r.publisher_id === manifest.publisher_id);
  if (!root) {
    return {
      valid: false,
      reason: `Publisher ${manifest.publisher_id} not in trust roots`,
    };
  }

  let sigBytes: Uint8Array;
  let pubKeyBytes: Uint8Array;
  try {
    const sigB64 = readFileSync(sigPath, 'utf8').trim();
    sigBytes = decodeBase64(sigB64);
    pubKeyBytes = decodeBase64(root.public_key_base64);
  } catch {
    return { valid: false, reason: 'Failed to decode signature or public key' };
  }

  // Message = canonical JSON of manifest
  const message = Buffer.from(JSON.stringify(manifest));

  const valid = nacl.sign.detached.verify(message, sigBytes, pubKeyBytes);
  if (!valid) {
    return { valid: false, reason: 'Signature verification failed' };
  }

  // Optionally verify integrity hash of package contents
  const integrityHash = manifest.integrity_hash;

  return { valid: true, integrity_hash: integrityHash };
}

export function loadTrustRoots(trustDir: string): TrustRoot[] {
  const roots: TrustRoot[] = [];
  // Load from trust root files
  const indexPath = join(trustDir, 'roots.json');
  if (existsSync(indexPath)) {
    try {
      const parsed = JSON.parse(readFileSync(indexPath, 'utf8'));
      if (Array.isArray(parsed)) roots.push(...parsed);
    } catch {
      // Ignore malformed trust root file
    }
  }
  return roots;
}
