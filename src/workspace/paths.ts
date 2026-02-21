import { join } from 'node:path';
import type { ClonedPaths } from './types.js';

export function getClonedPaths(cwd: string = process.cwd()): ClonedPaths {
  const root = join(cwd, '.cloned');
  return {
    root,
    config: join(root, 'config.yaml'),
    stateDb: join(root, 'state.db'),
    auditLog: join(root, 'audit.log'),
    registry: join(root, 'registry.yaml'),
    trustDir: join(root, 'trust'),
    policyDir: join(root, 'policy'),
    artifactsDir: join(root, 'artifacts'),
  };
}
