import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dump } from 'js-yaml';
import { generateId } from '../shared/ids.js';
import { getClonedPaths } from './paths.js';
import { openDb } from './db.js';
import { writeWorkspaceConfig } from './config.js';
import { initBudgets } from '../governance/budgets.js';
import type { WorkspaceTier, WorkspaceConfig } from './types.js';

export interface InitOptions {
  type?: WorkspaceTier;
  cwd?: string;
  force?: boolean;
}

const DEFAULT_REGISTRY = {
  schema: 'registry.schema.json',
  version: '1.0.0',
  connectors: [],
};

export async function initWorkspace(opts: InitOptions = {}): Promise<WorkspaceConfig> {
  const tier: WorkspaceTier = opts.type ?? 'personal';
  const paths = getClonedPaths(opts.cwd);

  if (existsSync(paths.root) && !opts.force) {
    throw new Error(
      `Workspace already exists at ${paths.root}. Use --force to reinitialize.`,
    );
  }

  // Create directory structure
  for (const dir of [
    paths.root,
    paths.trustDir,
    paths.policyDir,
    paths.artifactsDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  const config: WorkspaceConfig = {
    workspace_id: generateId(12),
    type: tier,
    policy_pack: `policy.${tier}.default`,
    vault_provider: 'dev',
    created_at: new Date().toISOString(),
    version: '0.1.0',
  };

  // Write config
  writeWorkspaceConfig(paths.config, config);

  // Write empty registry
  writeFileSync(paths.registry, dump(DEFAULT_REGISTRY), 'utf8');

  // Initialize SQLite state DB
  const db = openDb(paths.stateDb);

  // Initialize budgets from policy pack
  await initBudgets(db, config.workspace_id, tier);

  // Create empty audit log
  writeFileSync(paths.auditLog, '', 'utf8');

  return config;
}
