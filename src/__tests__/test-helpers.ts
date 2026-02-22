import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import type { WorkspaceConfig } from '../workspace/types.js';

export interface TempWorkspace {
  workspaceDir: string;
  clonedDir: string;
  policyDir: string;
  policyPackId: string;
  cleanup: () => void;
}

export function createTempWorkspace(overrides: Partial<WorkspaceConfig> = {}): TempWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'cloned-ws-'));
  const clonedDir = join(root, '.cloned');
  mkdirSync(clonedDir, { recursive: true });

  const config: WorkspaceConfig = {
    workspace_id: overrides.workspace_id ?? `ws-${Date.now()}`,
    type: overrides.type ?? 'personal',
    policy_pack: overrides.policy_pack ?? 'policy.personal.default',
    vault_provider: overrides.vault_provider ?? 'dev',
    created_at: overrides.created_at ?? new Date().toISOString(),
    version: overrides.version ?? '1.0.0',
  };

  writeFileSync(join(clonedDir, 'config.yaml'), dump(config), 'utf8');

  return {
    workspaceDir: root,
    clonedDir,
    policyDir: join(clonedDir, 'policy'),
    policyPackId: config.policy_pack,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

import Database from 'better-sqlite3';
import { applyInlineSchema } from '../workspace/db.js';

/**
 * Create a fresh in-memory SQLite database with the full application schema.
 * Use this in tests that need a real database (runner, workspace-init, etc.)
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyInlineSchema(db);
  return db;
}
