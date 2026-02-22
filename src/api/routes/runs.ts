import type { FastifyInstance } from 'fastify';
import type { RouteOpts } from '../types.js';
import { getWorkspaceId } from '../types.js';
import { BUILT_IN_PIPELINES } from '../../runtime/pipelines.js';
import { generateId } from '../../shared/ids.js';

export async function registerRunRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/runs', async (req) => {
    const ws = getWorkspaceId(opts.config);
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
    const ws = getWorkspaceId(opts.config);
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
        vars?: Record<string, unknown>;
      };

      if (!body.pipeline_id) {
        return reply.status(400).send({ error: 'pipeline_id is required' });
      }

      if (!BUILT_IN_PIPELINES[body.pipeline_id]) {
        return reply.status(404).send({
          error: `Pipeline not found: ${body.pipeline_id}`,
          available: Object.keys(BUILT_IN_PIPELINES),
        });
      }

      const ws = getWorkspaceId(opts.config);
      const runId = generateId();
      const now = new Date().toISOString();

      opts.db
        .prepare(
          `INSERT INTO runs (id, workspace_id, pipeline_id, status, started_at, created_by, dry_run)
           VALUES (?, ?, ?, 'pending', ?, 'api', ?)`,
        )
        .run(runId, ws, body.pipeline_id, now, body.dry_run ? 1 : 0);

      return reply.status(202).send({
        run_id: runId,
        pipeline_id: body.pipeline_id,
        status: 'pending',
        dry_run: body.dry_run ?? false,
      });
    },
  );
}
