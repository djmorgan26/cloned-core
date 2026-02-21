import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { WorkspaceConfig, ClonedPaths } from '../../workspace/types.js';

interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export async function registerRunRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/runs', async (req) => {
    const ws = opts.config?.workspace_id ?? 'default';
    const query = req.query as { limit?: string; offset?: string };
    const limit = parseInt(query.limit ?? '50', 10);
    const offset = parseInt(query.offset ?? '0', 10);

    const runs = opts.db
      .prepare(
        `SELECT * FROM runs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
      )
      .all(ws, limit, offset);

    return { runs, limit, offset };
  });

  fastify.get<{ Params: { id: string } }>('/v1/runs/:id', async (req, reply) => {
    const ws = opts.config?.workspace_id ?? 'default';
    const run = opts.db
      .prepare(`SELECT * FROM runs WHERE id = ? AND workspace_id = ?`)
      .get(req.params.id, ws);
    if (!run) return reply.status(404).send({ error: 'Run not found' });
    return run;
  });

  fastify.post(
    '/v1/runs',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = req.body as {
        pipeline_id?: string;
        dry_run?: boolean;
        input?: Record<string, unknown>;
      };

      if (!body.pipeline_id) {
        return reply.status(400).send({ error: 'pipeline_id is required' });
      }

      // Stub: In production, look up pipeline and enqueue a run
      return reply.status(202).send({
        message: 'Run accepted',
        pipeline_id: body.pipeline_id,
        dry_run: body.dry_run ?? false,
        status: 'pending',
      });
    },
  );
}
