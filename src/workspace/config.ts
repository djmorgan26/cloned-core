import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dump, load } from 'js-yaml';
import type { WorkspaceConfig } from './types.js';
import { WorkspaceConfigSchema } from '../shared/schemas.js';

export function readWorkspaceConfig(configPath: string): WorkspaceConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Workspace not initialized. Run \`cloned init\` first.`);
  }
  const raw = readFileSync(configPath, 'utf8');
  const parsed = load(raw);
  try {
    return WorkspaceConfigSchema.parse(parsed) as WorkspaceConfig;
  } catch {
    // Fall back to cast if validation fails (handles existing workspaces with extra fields)
    return parsed as WorkspaceConfig;
  }
}

export function writeWorkspaceConfig(configPath: string, config: WorkspaceConfig): void {
  writeFileSync(configPath, dump(config), 'utf8');
}
