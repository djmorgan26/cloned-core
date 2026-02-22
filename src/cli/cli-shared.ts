import { getClonedPaths } from '../workspace/paths.js';
import { readWorkspaceConfig } from '../workspace/config.js';
import { openDb } from '../workspace/db.js';
import type { WorkspaceConfig, ClonedPaths } from '../workspace/types.js';
import type Database from 'better-sqlite3';

export interface WorkspaceContext {
  paths: ClonedPaths;
  config: WorkspaceConfig;
  db: Database.Database;
}

/**
 * Load workspace config and open db, or print error and exit.
 * Use at the top of every CLI command that requires an initialized workspace.
 */
export function requireWorkspace(cwd?: string): WorkspaceContext {
  const paths = getClonedPaths(cwd);
  let config: WorkspaceConfig | undefined;
  try {
    config = readWorkspaceConfig(paths.config);
  } catch {
    // eslint-disable-next-line no-console
    console.error('Workspace not initialized. Run: cloned init');
    process.exit(1);
  }
  const db = openDb(paths.stateDb);
  return { paths, config: config as WorkspaceConfig, db };
}
