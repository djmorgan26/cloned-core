import type { FastifyInstance } from 'fastify';
import type { RouteOpts } from '../types.js';
import { getWorkspaceId } from '../types.js';
import { getBudgets } from '../../governance/budgets.js';

export async function registerBudgetRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/budgets', async () => {
    const ws = getWorkspaceId(opts.config);
    const budgets = getBudgets(opts.db, ws);
    return { budgets };
  });
}
