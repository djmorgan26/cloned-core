import type { FastifyInstance } from 'fastify';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, '../../docs');

interface DocEntry {
  path: string;
  title: string;
  description?: string;
  audience: string[];
  category: string;
}

function collectMdFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  const entries = readdirSync(join(dir, prefix), { withFileTypes: true });
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const full = join(dir, prefix, e.name);
    if (e.isDirectory()) {
      out.push(...collectMdFiles(dir, rel));
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(rel);
    }
  }
  return out;
}

function parseFrontmatter(relPath: string): DocEntry | null {
  const full = join(docsDir, relPath);
  if (!existsSync(full)) return null;
  const raw = readFileSync(full, 'utf8');
  const { data } = matter(raw);
  const audience = Array.isArray(data?.audience) ? data.audience : [data?.audience].filter(Boolean);
  return {
    path: relPath,
    title: (data?.title as string) ?? relPath,
    description: data?.description,
    audience: audience as string[],
    category: (data?.category as string) ?? '',
  };
}

export async function registerDocsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { audience?: string } }>('/v1/docs', async (req, reply) => {
    if (!existsSync(docsDir)) {
      return reply.status(404).send({ error: 'docs directory not found' });
    }
    const audienceFilter = req.query?.audience ?? 'public';
    const files = collectMdFiles(docsDir);
    const entries: DocEntry[] = [];
    for (const rel of files) {
      const entry = parseFrontmatter(rel);
      if (!entry) continue;
      if (audienceFilter === 'all') {
        entries.push(entry);
      } else if (entry.audience.includes(audienceFilter)) {
        entries.push(entry);
      }
    }
    return { docs: entries };
  });

  fastify.get<{ Params: { '*': string } }>('/v1/docs/*', async (req, reply) => {
    const pathSeg = (req.params as { '*'?: string })['*'] ?? '';
    const normalized = normalize(pathSeg).replace(/^\/+/, '');
    if (normalized.startsWith('..') || normalized.includes('..')) {
      return reply.status(400).send({ error: 'Invalid path' });
    }
    const full = join(docsDir, normalized);
    if (!existsSync(full) || !resolve(full).startsWith(resolve(docsDir))) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const content = readFileSync(full, 'utf8');
    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    return content;
  });
}
