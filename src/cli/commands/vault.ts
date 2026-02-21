import type { Command } from 'commander';
import { getVaultProvider } from '../../vault/index.js';

export function registerVaultCommand(program: Command): void {
  const vault = program
    .command('vault')
    .description('Manage vault secrets (references only; never shows values)');

  vault
    .command('status')
    .description('Show vault provider status and secret references')
    .action(async () => {
      const provider = getVaultProvider();
      const status = await provider.status();
      const secrets = await provider.listSecrets();

      console.log(`\nVault Provider: ${status.provider}`);
      console.log(`Status: ${status.healthy ? 'healthy' : 'unhealthy'}`);
      if (status.message) console.log(`Message: ${status.message}`);
      console.log(`\nSecrets (${secrets.length}):`);
      if (secrets.length === 0) {
        console.log('  (none)');
      } else {
        for (const s of secrets) {
          const modified = s.lastModified ? ` (modified: ${s.lastModified})` : '';
          console.log(`  - ${s.name}${modified}`);
        }
      }
      console.log('\nNote: Secret values are never displayed.');
    });

  vault
    .command('set <key> <value>')
    .description('Store a secret in the vault')
    .action(async (key: string, value: string) => {
      const provider = getVaultProvider();
      await provider.setSecret(key, value);
      console.log(`Secret stored: ${key}`);
      console.log('(Value not echoed for security)');
    });

  vault
    .command('delete <key>')
    .description('Delete a secret from the vault')
    .action(async (key: string) => {
      const provider = getVaultProvider();
      await provider.deleteSecret(key);
      console.log(`Secret deleted: ${key}`);
    });
}
