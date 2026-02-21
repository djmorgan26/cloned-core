import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { WorkspaceConfig, ClonedPaths } from '../../workspace/types.js';
import { getVaultProvider } from '../../vault/index.js';

interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export async function registerVaultRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/vault/status', async () => {
    const vault = getVaultProvider();
    const status = await vault.status();
    // List secret names only (NEVER values)
    const secrets = await vault.listSecrets();
    return {
      provider: status.provider,
      healthy: status.healthy,
      message: status.message,
      secret_count: secrets.length,
      secrets: secrets.map((s) => ({ name: s.name, last_modified: s.lastModified })),
    };
  });
}
