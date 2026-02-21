import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { WorkspaceConfig, ClonedPaths } from '../../workspace/types.js';
import { getBudgets } from '../../governance/budgets.js';

interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export async function registerBudgetRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/budgets', async () => {
    const ws = opts.config?.workspace_id ?? 'default';
    const budgets = getBudgets(opts.db, ws);
    return { budgets };
  });
}
