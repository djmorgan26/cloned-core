import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { WorkspaceConfig, ClonedPaths } from '../../workspace/types.js';
import { runDoctorChecks } from '../../runtime/doctor.js';

interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export async function registerDoctorRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/doctor', async () => {
    // Resolve cwd from the workspace paths root so checks find the right files
    const cwd = opts.paths.root.replace(/\/\.cloned$/, '');
    const report = await runDoctorChecks(cwd);
    return report;
  });
}
