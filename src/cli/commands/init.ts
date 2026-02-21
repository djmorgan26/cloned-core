import type { Command } from 'commander';
import { initWorkspace } from '../../workspace/init.js';
import type { WorkspaceTier } from '../../workspace/types.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a Cloned workspace in the current directory')
    .option('-t, --type <tier>', 'Workspace tier: personal, shared, or enterprise', 'personal')
    .option('--force', 'Reinitialize even if workspace already exists', false)
    .action(async (opts) => {
      const tier = opts.type as WorkspaceTier;
      if (!['personal', 'shared', 'enterprise'].includes(tier)) {
        console.error(`Invalid tier: ${tier}. Must be personal, shared, or enterprise.`);
        process.exit(1);
      }

      console.log(`Initializing ${tier} workspace...`);

      try {
        const config = await initWorkspace({ type: tier, force: opts.force });
        console.log(`\nWorkspace initialized!`);
        console.log(`  Workspace ID: ${config.workspace_id}`);
        console.log(`  Type:         ${config.type}`);
        console.log(`  Policy pack:  ${config.policy_pack}`);
        console.log(`  Vault:        ${config.vault_provider}`);
        console.log(`\nNext steps:`);
        console.log(`  cloned onboard   – choose a blueprint and set up connectors`);
        console.log(`  cloned connect   – connect services (github, youtube, ...)`);
        console.log(`  cloned serve     – start the Command Center UI`);
        console.log(`  cloned doctor    – check environment health`);
      } catch (err) {
        console.error(`Init failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
