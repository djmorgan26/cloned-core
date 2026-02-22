import type { FastifyInstance } from 'fastify';
import type { RouteOpts } from '../types.js';
import { getWorkspaceId } from '../types.js';
import {
  listApprovals,
  decideApproval,
  getApproval,
} from '../../governance/approvals.js';

export async function registerApprovalRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/approvals', async (req) => {
    const ws = getWorkspaceId(opts.config);
    const query = req.query as { status?: string };
    const filter = query.status
      ? { status: query.status as 'pending' | 'approved' | 'denied' }
      : undefined;
    return { approvals: listApprovals(opts.db, ws, filter) };
  });

  fastify.get<{ Params: { id: string } }>('/v1/approvals/:id', async (req, reply) => {
    const ws = getWorkspaceId(opts.config);
    const approval = getApproval(opts.db, ws, req.params.id);
    if (!approval) return reply.status(404).send({ error: 'Approval not found' });
    return approval;
  });

  fastify.post<{ Params: { id: string } }>(
    '/v1/approvals/:id/decide',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const ws = getWorkspaceId(opts.config);
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
