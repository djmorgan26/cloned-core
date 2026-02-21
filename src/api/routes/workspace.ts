import type { FastifyInstance } from 'fastify';
import type { WorkspaceConfig } from '../../workspace/types.js';
import type { ClonedPaths } from '../../workspace/types.js';
import type Database from 'better-sqlite3';

interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export async function registerWorkspaceRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/workspace', async (_req, reply) => {
    if (!opts.config) {
      return reply.status(503).send({ error: 'Workspace not initialized' });
    }
    return {
      workspace_id: opts.config.workspace_id,
      type: opts.config.type,
      policy_pack: opts.config.policy_pack,
      vault_provider: opts.config.vault_provider,
      version: opts.config.version,
      created_at: opts.config.created_at,
    };
  });
}
