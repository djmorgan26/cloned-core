import { describe, it, expect } from '@jest/globals';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import type { PolicyPack } from '../governance/policy.js';
import { registerFirewallCommand } from '../cli/commands/firewall.js';
import { createTempWorkspace } from './test-helpers.js';

async function runFirewallCommand(args: string[], cwd: string) {
  const program = new Command();
  program.exitOverride();
  registerFirewallCommand(program);
  await program.parseAsync(['firewall', ...args, '--cwd', cwd], { from: 'user' });
}

describe('Firewall CLI', () => {
  it('writes workspace overlay for global and tool-specific allows', async () => {
    const ws = createTempWorkspace();
    try {
      await runFirewallCommand(['allow', 'api.example.com'], ws.workspaceDir);
      await runFirewallCommand(
        ['allow', 'internal.example.com', '--tool', 'cloned.internal.test@v1'],
        ws.workspaceDir,
      );

      const overlayPath = join(ws.policyDir, `${ws.policyPackId}.yaml`);
      const pack = load(readFileSync(overlayPath, 'utf8')) as PolicyPack;
      expect(pack.allowlists.egress_domains).toEqual(expect.arrayContaining(['api.example.com']));
      expect(pack.allowlists.egress_by_tool['cloned.internal.test@v1']).toEqual(
        expect.arrayContaining(['internal.example.com']),
      );
    } finally {
      ws.cleanup();
    }
  });

  it('removes domains from the overlay per scope', async () => {
    const ws = createTempWorkspace();
    try {
      await runFirewallCommand(['allow', 'remove-me.example.com'], ws.workspaceDir);
      await runFirewallCommand(
        ['allow', 'tool-only.example.com', '--tool', 'cloned.internal.test@v1'],
        ws.workspaceDir,
      );

      await runFirewallCommand(['remove', 'remove-me.example.com'], ws.workspaceDir);
      await runFirewallCommand(
        ['remove', 'tool-only.example.com', '--tool', 'cloned.internal.test@v1'],
        ws.workspaceDir,
      );

      const overlayPath = join(ws.policyDir, `${ws.policyPackId}.yaml`);
      const pack = load(readFileSync(overlayPath, 'utf8')) as PolicyPack;
      expect(pack.allowlists.egress_domains).not.toContain('remove-me.example.com');
      expect(pack.allowlists.egress_by_tool['cloned.internal.test@v1'] ?? []).not.toContain(
        'tool-only.example.com',
      );
    } finally {
      ws.cleanup();
    }
  });
});
