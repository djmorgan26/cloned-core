import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { WorkspaceConfig, ClonedPaths } from '../../workspace/types.js';
import {
  listApprovals,
  decideApproval,
  getApproval,
} from '../../governance/approvals.js';

interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export async function registerApprovalRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/approvals', async (req) => {
    const ws = opts.config?.workspace_id ?? 'default';
    const query = req.query as { status?: string };
    const filter = query.status
      ? { status: query.status as 'pending' | 'approved' | 'denied' }
      : undefined;
    return { approvals: listApprovals(opts.db, ws, filter) };
  });

  fastify.get<{ Params: { id: string } }>('/v1/approvals/:id', async (req, reply) => {
    const ws = opts.config?.workspace_id ?? 'default';
    const approval = getApproval(opts.db, ws, req.params.id);
    if (!approval) return reply.status(404).send({ error: 'Approval not found' });
    return approval;
  });

  fastify.post<{ Params: { id: string } }>(
    '/v1/approvals/:id/decide',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const ws = opts.config?.workspace_id ?? 'default';
      const body = req.body as { decision?: 'approved' | 'denied'; reason?: string };

      if (!body.decision || !['approved', 'denied'].includes(body.decision)) {
        return reply.status(400).send({ error: 'decision must be approved or denied' });
      }

      try {
        const updated = decideApproval(opts.db, ws, req.params.id, body.decision, body.reason);
        return updated;
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    },
  );
}
