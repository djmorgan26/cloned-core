import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyConnectorSignature, loadTrustRoots } from './signing.js';
import { addConnector, loadRegistry, saveRegistry } from './registry.js';
import type { ConnectorEntry } from './registry.js';
import { logger } from '../shared/logger.js';

export interface InstallOptions {
  registryPath: string;
  trustDir: string;
  dryRun?: boolean;
  skipSignatureVerification?: boolean;
}

export interface InstallResult {
  success: boolean;
  connector?: ConnectorEntry;
  error?: string;
  dry_run?: boolean;
}

export async function installConnector(
  packagePath: string,
  opts: InstallOptions,
): Promise<InstallResult> {
  if (!existsSync(packagePath)) {
    return { success: false, error: `Package not found: ${packagePath}` };
  }

  const manifestPath = join(packagePath, 'package.manifest.json');
  if (!existsSync(manifestPath)) {
    return { success: false, error: 'Missing package.manifest.json in connector package' };
  }

  let manifest: {
    id?: string;
    version?: string;
    publisher_id?: string;
    capabilities_provided?: string[];
    integrity_hash?: string;
  };

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { success: false, error: 'Failed to parse package.manifest.json' };
  }

  if (!manifest.id || !manifest.version || !manifest.publisher_id) {
    return { success: false, error: 'Manifest missing required fields: id, version, publisher_id' };
  }

  // Signature verification
  if (!opts.skipSignatureVerification) {
    const trustRoots = loadTrustRoots(opts.trustDir);
    const verification = verifyConnectorSignature(packagePath, trustRoots);
    if (!verification.valid) {
      logger.error('Connector signature verification failed', {
        package: packagePath,
        reason: verification.reason,
      });
      return { success: false, error: `Signature verification failed: ${verification.reason}` };
    }
    logger.info('Connector signature verified', { connector: manifest.id });
  } else {
    logger.warn('Signature verification skipped (development mode)');
  }

  const entry: ConnectorEntry = {
    id: manifest.id,
    version: manifest.version,
    publisher_id: manifest.publisher_id,
    enabled: true,
    installed_at: new Date().toISOString(),
    manifest_path: manifestPath,
    capabilities_provided: manifest.capabilities_provided ?? [],
    integrity_hash: manifest.integrity_hash,
  };

  if (opts.dryRun) {
    logger.info('[DRY RUN] Would install connector', { connector: entry.id });
    return { success: true, connector: entry, dry_run: true };
  }

  const registry = loadRegistry(opts.registryPath);
  addConnector(registry, entry);
  saveRegistry(opts.registryPath, registry);

  logger.info('Connector installed', { connector: entry.id, version: entry.version });
  return { success: true, connector: entry };
}
