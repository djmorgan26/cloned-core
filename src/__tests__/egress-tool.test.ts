import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { getClonedPaths } from '../workspace/paths.js';
import type { PolicyPack } from '../governance/policy.js';
import { applyEgressUpdate } from '../runtime/tools/index.js';
import { createTempWorkspace } from './test-helpers.js';

describe('applyEgressUpdate', () => {
  it('merges global domains and dedupes entries', () => {
    const ws = createTempWorkspace();
    try {
      const paths = getClonedPaths(ws.workspaceDir);
      applyEgressUpdate({
        policyPackId: ws.policyPackId,
        paths,
        scope: 'global',
        domains: ['api.example.com', 'api.example.com'],
      });

      const overlayPath = join(ws.policyDir, `${ws.policyPackId}.yaml`);
      const pack = load(readFileSync(overlayPath, 'utf8')) as PolicyPack;
      const matches = pack.allowlists.egress_domains.filter((d) => d === 'api.example.com');
      expect(matches).toHaveLength(1);
    } finally {
      ws.cleanup();
    }
  });

  it('merges tool-specific domains', () => {
    const ws = createTempWorkspace();
    try {
      const paths = getClonedPaths(ws.workspaceDir);
      applyEgressUpdate({
        policyPackId: ws.policyPackId,
        paths,
        scope: 'tool',
        toolId: 'cloned.mcp.web.search@v1',
        domains: ['safe.example.com'],
      });

      const overlayPath = join(ws.policyDir, `${ws.policyPackId}.yaml`);
      const pack = load(readFileSync(overlayPath, 'utf8')) as PolicyPack;
      expect(pack.allowlists.egress_by_tool['cloned.mcp.web.search@v1']).toEqual(
        expect.arrayContaining(['safe.example.com']),
      );
    } finally {
      ws.cleanup();
    }
  });

  it('requires tool_id when scope is tool', () => {
    const ws = createTempWorkspace();
    try {
      const paths = getClonedPaths(ws.workspaceDir);
      expect(() =>
        applyEgressUpdate({
          policyPackId: ws.policyPackId,
          paths,
          scope: 'tool',
          domains: ['bad.example.com'],
        }),
      ).toThrow(/tool scope requires tool_id/);
      const overlayPath = join(ws.policyDir, `${ws.policyPackId}.yaml`);
      expect(existsSync(overlayPath)).toBe(false);
    } finally {
      ws.cleanup();
    }
  });
});
