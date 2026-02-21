import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dump, load } from 'js-yaml';
import type { WorkspaceConfig } from './types.js';

export function readWorkspaceConfig(configPath: string): WorkspaceConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Workspace not initialized. Run \`cloned init\` first.`);
  }
  const raw = readFileSync(configPath, 'utf8');
  return load(raw) as WorkspaceConfig;
}

export function writeWorkspaceConfig(configPath: string, config: WorkspaceConfig): void {
  writeFileSync(configPath, dump(config), 'utf8');
}
