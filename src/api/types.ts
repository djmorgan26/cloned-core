import type Database from 'better-sqlite3';
import type { WorkspaceConfig, ClonedPaths } from '../workspace/types.js';

export interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export function getWorkspaceId(config: WorkspaceConfig | null): string {
  return config?.workspace_id ?? 'default';
}
