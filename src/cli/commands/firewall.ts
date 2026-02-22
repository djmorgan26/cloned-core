import type { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dump } from 'js-yaml';
import { getClonedPaths } from '../../workspace/paths.js';
import { readWorkspaceConfig } from '../../workspace/config.js';
import { loadPolicyPack } from '../../governance/policy.js';

function ensurePolicyDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function registerFirewallCommand(program: Command): void {
  const fw = program
    .command('firewall')
    .description('Manage egress allowlists (per-tool and global)');

  fw.command('list')
    .description('List current egress allowlists')
    .option('--cwd <dir>', 'Workspace directory', process.cwd())
    .action((opts) => {
      const paths = getClonedPaths(opts.cwd);
      const cfg = readWorkspaceConfig(paths.config);
      const pack = loadPolicyPack(cfg.policy_pack, paths.policyDir);
      console.log('Policy pack:', pack.pack_id);
      console.log('\nGlobal egress domains:');
      pack.allowlists.egress_domains.forEach((d) => console.log(`  - ${d}`));
      console.log('\nEgress by tool:');
      for (const [tool, list] of Object.entries(pack.allowlists.egress_by_tool)) {
        console.log(`  ${tool}:`);
        list.forEach((d) => console.log(`    - ${d}`));
      }
      console.log('\nEgress by connector:');
      for (const [conn, list] of Object.entries(pack.allowlists.egress_by_connector)) {
        console.log(`  ${conn}:`);
        list.forEach((d) => console.log(`    - ${d}`));
      }
    });

  fw.command('allow')
    .description('Allow domain(s) globally or for a specific tool')
    .argument('<domain...>', 'Domain(s) to allow (e.g., api.example.com)')
    .option('--tool <tool_id>', 'Tool ID to scope the rule to')
    .option('--cwd <dir>', 'Workspace directory', process.cwd())
    .action((domains: string[], opts) => {
      const paths = getClonedPaths(opts.cwd);
      const cfg = readWorkspaceConfig(paths.config);
      const pack = loadPolicyPack(cfg.policy_pack, paths.policyDir);

      if (opts.tool) {
        const cur = pack.allowlists.egress_by_tool[opts.tool] ?? [];
        pack.allowlists.egress_by_tool[opts.tool] = Array.from(new Set([...cur, ...domains]));
        console.log(`Added to egress_by_tool[${opts.tool}]:`, domains.join(', '));
      } else {
        pack.allowlists.egress_domains = Array.from(new Set([...pack.allowlists.egress_domains, ...domains]));
        console.log('Added to global egress_domains:', domains.join(', '));
      }

      ensurePolicyDir(paths.policyDir);
      writeFileSync(`${paths.policyDir}/${cfg.policy_pack}.yaml`, dump(pack), 'utf8');
    });

  fw.command('remove')
    .description('Remove a domain from global or tool allowlist')
    .argument('<domain>', 'Domain to remove')
    .option('--tool <tool_id>', 'Tool ID to scope the removal to')
    .option('--cwd <dir>', 'Workspace directory', process.cwd())
    .action((domain: string, opts) => {
      const paths = getClonedPaths(opts.cwd);
      const cfg = readWorkspaceConfig(paths.config);
      const pack = loadPolicyPack(cfg.policy_pack, paths.policyDir);

      if (opts.tool) {
        const cur = pack.allowlists.egress_by_tool[opts.tool] ?? [];
        pack.allowlists.egress_by_tool[opts.tool] = cur.filter((d) => d !== domain);
        console.log(`Removed from egress_by_tool[${opts.tool}]: ${domain}`);
      } else {
        pack.allowlists.egress_domains = pack.allowlists.egress_domains.filter((d) => d !== domain);
        console.log(`Removed from global egress_domains: ${domain}`);
      }

      ensurePolicyDir(paths.policyDir);
      writeFileSync(`${paths.policyDir}/${cfg.policy_pack}.yaml`, dump(pack), 'utf8');
    });
}

