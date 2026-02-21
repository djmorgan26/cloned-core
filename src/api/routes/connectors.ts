import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { WorkspaceConfig, ClonedPaths } from '../../workspace/types.js';
import { loadRegistry } from '../../connector/registry.js';
import { installConnector } from '../../connector/installer.js';

interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export async function registerConnectorRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/connectors', async (_req, reply) => {
    const registry = loadRegistry(opts.paths.registry);
    return { connectors: registry.connectors };
  });

  fastify.post('/v1/connectors', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = req.body as { package_path?: string; verify?: boolean; dry_run?: boolean };

    if (!body.package_path) {
      return reply.status(400).send({ error: 'package_path is required' });
    }

    const result = await installConnector(body.package_path, {
      registryPath: opts.paths.registry,
      trustDir: opts.paths.trustDir,
      dryRun: body.dry_run ?? false,
      skipSignatureVerification: body.verify === false,
    });

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.status(200).send({ connector: result.connector, dry_run: result.dry_run });
  });

  fastify.post<{ Params: { id: string } }>('/v1/connectors/:id/enable', async (req, reply) => {
    const registry = loadRegistry(opts.paths.registry);
    const { enableConnector, saveRegistry } = await import('../../connector/registry.js');
    const ok = enableConnector(registry, req.params.id);
    if (!ok) return reply.status(404).send({ error: 'Connector not found' });
    saveRegistry(opts.paths.registry, registry);
    return { id: req.params.id, enabled: true };
  });

  fastify.post<{ Params: { id: string } }>('/v1/connectors/:id/disable', async (req, reply) => {
    const registry = loadRegistry(opts.paths.registry);
    const { disableConnector, saveRegistry } = await import('../../connector/registry.js');
    const ok = disableConnector(registry, req.params.id);
    if (!ok) return reply.status(404).send({ error: 'Connector not found' });
    saveRegistry(opts.paths.registry, registry);
    return { id: req.params.id, enabled: false };
  });
}
