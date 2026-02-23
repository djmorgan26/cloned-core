import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticServe from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClonedPaths } from '../workspace/paths.js';
import { openDb } from '../workspace/db.js';
import { readWorkspaceConfig } from '../workspace/config.js';
import { loadWorkspaceEnv } from '../workspace/env.js';
import { loadPolicyPack } from '../governance/policy.js';
import { logger } from '../shared/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { registerWorkspaceRoutes } from './routes/workspace.js';
import { registerConnectorRoutes } from './routes/connectors.js';
import { registerApprovalRoutes } from './routes/approvals.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerBudgetRoutes } from './routes/budgets.js';
import { registerVaultRoutes } from './routes/vault.js';
import { registerDoctorRoutes } from './routes/doctor.js';
import { registerPairingRoutes } from './routes/pairings.js';
import { registerDocsRoutes } from './routes/docs.js';
import { registerPairingMiddleware } from './pairing-middleware.js';

export interface ServerOptions {
  host?: string;
  port?: number;
  cwd?: string;
}

export async function createServer(opts: ServerOptions = {}) {
  loadWorkspaceEnv(opts.cwd ?? process.cwd());
  const host = opts.host ?? process.env['CLONED_API_HOST'] ?? '127.0.0.1';
  const port = opts.port ?? parseInt(process.env['CLONED_API_PORT'] ?? '7800', 10);

  // Enforce loopback bind by default
  const isLoopback =
    host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '0.0.0.0';
  if (!isLoopback) {
    logger.warn('Non-loopback bind requested. Ensure authentication is configured.', { host });
  }

  const paths = getClonedPaths(opts.cwd);
  const db = openDb(paths.stateDb);
  let config;
  try {
    config = readWorkspaceConfig(paths.config);
  } catch {
    logger.warn('Workspace not initialized – running in unconfigured mode');
    config = null;
  }

  const fastify = Fastify({
    logger: false,
    trustProxy: false,
  });

  // CORS – restrict to loopback origins by default
  const allowedOrigins: string[] = config
    ? loadPolicyPack(config.policy_pack).ui.allowed_origins
    : ['http://localhost', 'http://127.0.0.1', 'http://[::1]'];

  await fastify.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
    credentials: true,
  });

  // Rate limiting for auth endpoints
  await fastify.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
  });

  // Security headers
  fastify.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '0');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    );
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  // Device pairing enforcement – runs before all routes
  registerPairingMiddleware(fastify, db);

  // Routes under /v1
  const routeOpts = { db, config, paths };
  await registerWorkspaceRoutes(fastify, routeOpts);
  await registerConnectorRoutes(fastify, routeOpts);
  await registerApprovalRoutes(fastify, routeOpts);
  await registerRunRoutes(fastify, routeOpts);
  await registerBudgetRoutes(fastify, routeOpts);
  await registerVaultRoutes(fastify, routeOpts);
  await registerDoctorRoutes(fastify, routeOpts);
  await registerPairingRoutes(fastify, routeOpts);
  await registerDocsRoutes(fastify);

  // Serve compiled UI if available
  const uiDir = join(__dirname, '../../dist/ui');
  if (existsSync(uiDir)) {
    await fastify.register(staticServe, {
      root: uiDir,
      prefix: '/',
      wildcard: false,
    });
    // SPA fallback
    fastify.get('/*', async (_req, reply) => {
      return reply.sendFile('index.html');
    });
    logger.info('Serving Command Center UI', { path: uiDir });
  } else {
    logger.info('UI not built. Run: cd ui && npm install && npm run build');
  }

  return { fastify, host, port };
}

export async function startServer(opts: ServerOptions = {}): Promise<void> {
  const { fastify, host, port } = await createServer(opts);

  try {
    await fastify.listen({ host, port });
    logger.info('Cloned API server listening', { host, port, url: `http://${host}:${port}/v1` });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

// Entry point when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
