/**
 * Device pairing enforcement middleware.
 *
 * Bootstrap mode: if no pairings exist in the DB, all requests are allowed
 * (this lets a fresh install register its first device).
 *
 * Enforcement mode: once at least one approved pairing exists, every request
 * must include X-Device-Id matching an approved pairing. Unpaired requests
 * receive 401 with a clear message.
 *
 * Routes exempt from enforcement:
 *   POST /v1/pairings         – submit a pairing request
 *   GET  /v1/doctor           – health checks (no auth required)
 *   GET  /v1/health           – future health endpoint
 */
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

const EXEMPT_ROUTES = new Set([
  'POST /v1/pairings',
  'GET /v1/doctor',
  'GET /v1/health',
]);

export function registerPairingMiddleware(fastify: FastifyInstance, db: Database.Database): void {
  // Prepare statements once – avoids SQL parse overhead on every request
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM pairings WHERE status = 'approved'`);
  const lookupStmt = db.prepare(
    `SELECT status FROM pairings WHERE device_public_key = ? AND status = 'approved'`,
  );

  fastify.addHook('onRequest', async (req, reply) => {
    const routeKey = `${req.method} ${req.url.split('?')[0]}`;
    if (EXEMPT_ROUTES.has(routeKey)) return;

    // Count approved pairings – if none, we're in bootstrap mode
    const { count } = countStmt.get() as { count: number };

    if (count === 0) {
      // Bootstrap mode: no approved pairings yet, allow everything
      return;
    }

    const deviceId = req.headers['x-device-id'] as string | undefined;
    if (!deviceId) {
      return reply.status(401).send({
        error: 'Device pairing required',
        message:
          'Include X-Device-Id header with an approved device ID. ' +
          'Use POST /v1/pairings to register a new device.',
      });
    }

    const pairing = lookupStmt.get(deviceId);

    if (!pairing) {
      return reply.status(401).send({
        error: 'Device not approved',
        message:
          `Device '${deviceId}' is not an approved pairing. ` +
          'Use POST /v1/pairings/:id/approve to approve a pending device.',
      });
    }
  });
}
