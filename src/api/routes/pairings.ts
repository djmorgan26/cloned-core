import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { WorkspaceConfig, ClonedPaths } from '../../workspace/types.js';

interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export async function registerPairingRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  fastify.get('/v1/pairings', async () => {
    const pairings = opts.db
      .prepare(
        `SELECT device_public_key, display_name, status, requested_scopes_json,
                approved_scopes_json, created_at, approved_at, revoked_at
         FROM pairings ORDER BY created_at DESC`,
      )
      .all();
    return { pairings };
  });

  fastify.post(
    '/v1/pairings',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = req.body as {
        device_public_key?: string;
        display_name?: string;
        requested_scopes?: string[];
      };

      if (!body.device_public_key) {
        return reply.status(400).send({ error: 'device_public_key is required' });
      }

      const existing = opts.db
        .prepare(`SELECT * FROM pairings WHERE device_public_key = ?`)
        .get(body.device_public_key);

      if (existing) {
        return reply.status(409).send({ error: 'Device already registered' });
      }

      const now = new Date().toISOString();
      opts.db.prepare(`
        INSERT INTO pairings
          (device_public_key, display_name, status, requested_scopes_json, created_at)
        VALUES (?, ?, 'pending', ?, ?)
      `).run(
        body.device_public_key,
        body.display_name ?? null,
        JSON.stringify(body.requested_scopes ?? []),
        now,
      );

      return reply.status(202).send({
        message: 'Pairing request submitted',
        status: 'pending',
        device_public_key: body.device_public_key,
      });
    },
  );

  fastify.post<{ Params: { request_id: string } }>(
    '/v1/pairings/:request_id/approve',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = req.body as { approved_scopes?: string[] };
      const pairing = opts.db
        .prepare(`SELECT * FROM pairings WHERE device_public_key = ? AND status = 'pending'`)
        .get(req.params.request_id) as { device_public_key: string; requested_scopes_json: string } | undefined;

      if (!pairing) {
        return reply.status(404).send({ error: 'Pending pairing not found' });
      }

      const now = new Date().toISOString();
      opts.db.prepare(`
        UPDATE pairings
        SET status = 'approved', approved_at = ?, approved_scopes_json = ?
        WHERE device_public_key = ?
      `).run(
        now,
        JSON.stringify(body.approved_scopes ?? JSON.parse(pairing.requested_scopes_json)),
        pairing.device_public_key,
      );

      return { message: 'Pairing approved', device_public_key: pairing.device_public_key };
    },
  );

  fastify.post<{ Params: { request_id: string } }>(
    '/v1/pairings/:request_id/revoke',
    async (req, reply) => {
      const now = new Date().toISOString();
      const result = opts.db.prepare(`
        UPDATE pairings SET status = 'revoked', revoked_at = ?
        WHERE device_public_key = ? AND status != 'revoked'
      `).run(now, req.params.request_id);

      if (result.changes === 0) {
        return reply.status(404).send({ error: 'Pairing not found or already revoked' });
      }

      return { message: 'Pairing revoked' };
    },
  );
}
