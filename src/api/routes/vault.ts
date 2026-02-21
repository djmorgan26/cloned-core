import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { WorkspaceConfig, ClonedPaths } from '../../workspace/types.js';
import { getVaultProvider } from '../../vault/index.js';
import { join } from 'node:path';

interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export async function registerVaultRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/vault/status', async () => {
    // Use workspace-specific vault path; never expose secret values
    const vaultFilePath = join(opts.paths.root, 'vault.dev.json');
    const vault = getVaultProvider(vaultFilePath);
    const status = await vault.status();
    const secrets = await vault.listSecrets();
    return {
      provider: status.provider,
      healthy: status.healthy,
      message: status.message,
      secret_count: secrets.length,
      // Return names + last_modified only – never values
      secrets: secrets.map((s) => ({ name: s.name, last_modified: s.lastModified })),
    };
  });
}
