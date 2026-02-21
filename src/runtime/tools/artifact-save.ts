/**
 * Artifact save tool – cloned.internal.artifact.save@v1
 *
 * Writes content to .cloned/artifacts/<filename> and creates a manifest JSON
 * entry alongside it for provenance tracking.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { generateId } from '../../shared/ids.js';

export interface ArtifactSaveInput {
  content: string | Record<string, unknown>;
  filename: string;
  schema?: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactSaveOutput {
  artifact_id: string;
  path: string;
  manifest_path: string;
  size_bytes: number;
}

export function saveArtifact(
  input: ArtifactSaveInput,
  artifactsDir: string,
): ArtifactSaveOutput {
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true, mode: 0o700 });
  }

  const artifactId = generateId();
  const ext = extname(input.filename) || '.txt';
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Prefix with id to ensure uniqueness without conflicts
  const fileName = `${artifactId}-${safeName}`;
  const filePath = join(artifactsDir, fileName);
  const manifestPath = join(artifactsDir, `${artifactId}.manifest.json`);

  const content =
    typeof input.content === 'string' ? input.content : JSON.stringify(input.content, null, 2);

  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });

  const manifest = {
    artifact_id: artifactId,
    schema: input.schema ?? `artifact.raw${ext}@v1`,
    filename: safeName,
    stored_as: fileName,
    created_at: new Date().toISOString(),
    size_bytes: Buffer.byteLength(content, 'utf8'),
    metadata: input.metadata ?? {},
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });

  return {
    artifact_id: artifactId,
    path: filePath,
    manifest_path: manifestPath,
    size_bytes: manifest.size_bytes,
  };
}
