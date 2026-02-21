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
    const report = runDoctorChecks();
    return report;
  });
}
