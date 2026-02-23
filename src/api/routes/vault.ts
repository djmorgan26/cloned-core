import type { FastifyInstance } from 'fastify';
import type { RouteOpts } from '../types.js';
import { getVaultProvider } from '../../vault/index.js';
import { join } from 'node:path';

export async function registerVaultRoutes(fastify: FastifyInstance, opts: RouteOpts) {
  const vaultFilePath = join(opts.paths.root, 'vault.dev.json');
  const providerName = opts.config?.vault_provider ?? 'file';
  const vault = getVaultProvider({ provider: providerName, filePath: vaultFilePath });

  const serializeSecret = (secret: { name: string; lastModified?: string }) => ({
    name: secret.name,
    last_modified: secret.lastModified,
  });

  fastify.get('/v1/vault/status', async () => {
    const status = await vault.status();
    const secrets = await vault.listSecrets();
    return {
      provider: status.provider,
      healthy: status.healthy,
      message: status.message,
      secret_count: secrets.length,
      secrets: secrets.map(serializeSecret),
    };
  });

  fastify.get<{ Querystring: { include_values?: string } }>('/v1/vault/secrets', async (request) => {
    const includeValuesRaw = (request.query?.include_values ?? '').toLowerCase();
    const includeValues = ['1', 'true', 'yes'].includes(includeValuesRaw);
    const secrets = await vault.listSecrets();
    const serialized = secrets.map(serializeSecret);
    if (!includeValues) {
      return { secrets: serialized };
    }

    const withValues = await Promise.all(
      serialized.map(async (secret) => ({
        ...secret,
        value: await vault.getSecret(secret.name),
      })),
    );

    return { secrets: withValues };
  });

  fastify.get<{ Params: { name: string } }>('/v1/vault/secrets/:name', async (request, reply) => {
    const { name } = request.params;
    const value = await vault.getSecret(name);
    if (value === null) {
      reply.code(404);
      return { error: 'Secret not found' };
    }
    const meta = (await vault.listSecrets()).find((s) => s.name === name);
    return { name, value, last_modified: meta?.lastModified };
  });

  fastify.put<{ Params: { name: string }; Body: { value?: string } }>(
    '/v1/vault/secrets/:name',
    async (request, reply) => {
      const { name } = request.params;
      const value = request.body?.value;
      if (typeof value !== 'string') {
        reply.code(400);
        return { error: 'Secret value is required' };
      }
      await vault.setSecret(name, value);
      const meta = (await vault.listSecrets()).find((s) => s.name === name);
      return { name, value, last_modified: meta?.lastModified ?? new Date().toISOString() };
    },
  );

  fastify.delete<{ Params: { name: string } }>('/v1/vault/secrets/:name', async (request) => {
    const { name } = request.params;
    await vault.deleteSecret(name);
    return { deleted: true };
  });

  fastify.post<{
    Body: {
      secrets?: Record<string, string> | Array<{ name?: string; value?: string }>;
    };
  }>('/v1/vault/secrets/import', async (request, reply) => {
    const { secrets } = request.body ?? {};

    let entries: Array<{ name: string; value: string }> = [];
    if (Array.isArray(secrets)) {
      entries = secrets
        .filter((s): s is { name: string; value: string } =>
          typeof s?.name === 'string' && typeof s?.value === 'string',
        )
        .map((s) => ({ name: s.name, value: s.value }));
    } else if (secrets && typeof secrets === 'object') {
      entries = Object.entries(secrets)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([name, value]) => ({ name, value }));
    }

    if (entries.length === 0) {
      reply.code(400);
      return { error: 'Provide at least one secret to import' };
    }

    await Promise.all(entries.map((entry) => vault.setSecret(entry.name, entry.value)));

    return { imported: entries.length };
  });

  fastify.get('/v1/vault/secrets/export', async () => {
    const secrets = await vault.listSecrets();
    const result: Record<string, string> = {};
    for (const secret of secrets) {
      const value = await vault.getSecret(secret.name);
      if (value !== null) {
        result[secret.name] = value;
      }
    }
    return { secrets: result };
  });
}
