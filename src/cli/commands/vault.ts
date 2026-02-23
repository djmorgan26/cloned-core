import type { Command } from 'commander';
import { getVaultProvider } from '../../vault/index.js';
import { requireWorkspace } from '../cli-shared.js';
import {
  resolveVaultPath,
  switchWorkspaceVaultProvider,
  runAzureBootstrapWizard,
} from '../helpers/vault-wizard.js';

function printVaultStatus(status: { provider: string; healthy: boolean; message?: string }): void {
  console.log(`\nVault Provider: ${status.provider}`);
  console.log(`Status: ${status.healthy ? 'healthy' : 'unhealthy'}`);
  if (status.message) console.log(`Message: ${status.message}`);
}

export function registerVaultCommand(program: Command): void {
  const vault = program
    .command('vault')
    .description('Manage vault secrets (references only; never shows values)');

  vault
    .command('status')
    .description('Show vault provider status and secret references')
    .action(async () => {
      const workspace = requireWorkspace();
      const provider = getVaultProvider({
        provider: workspace.config.vault_provider,
        filePath: resolveVaultPath(workspace.paths.root),
      });
      const status = await provider.status();
      const secrets = await provider.listSecrets();

      printVaultStatus(status);
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
      const workspace = requireWorkspace();
      const provider = getVaultProvider({
        provider: workspace.config.vault_provider,
        filePath: resolveVaultPath(workspace.paths.root),
      });
      await provider.setSecret(key, value);
      console.log(`Secret stored: ${key}`);
      console.log('(Value not echoed for security)');
    });

  vault
    .command('delete <key>')
    .description('Delete a secret from the vault')
    .action(async (key: string) => {
      const workspace = requireWorkspace();
      const provider = getVaultProvider({
        provider: workspace.config.vault_provider,
        filePath: resolveVaultPath(workspace.paths.root),
      });
      await provider.deleteSecret(key);
      console.log(`Secret deleted: ${key}`);
    });

  vault
    .command('provider <name>')
    .description('Switch the workspace vault provider (dev|file|azure)')
    .option('--file-path <path>', 'Custom path for file provider (defaults to .cloned/vault.dev.json)')
    .action(async (name: string, opts: { filePath?: string }) => {
      const workspace = requireWorkspace();
      const providerName = name as 'dev' | 'file' | 'azure';
      console.log(`Vault provider set to ${providerName}.`);
      if (providerName === 'azure') {
        console.log('Make sure AZURE_KEYVAULT_URI / CLIENT_ID / TENANT_ID are exported.');
      }

      const status = await switchWorkspaceVaultProvider(workspace, providerName, {
        filePath: opts.filePath,
      });
      printVaultStatus(status);
      if (!status.healthy) {
        console.log('Run `cloned vault status` after fixing the issue above.');
      }
    });

  const bootstrap = vault
    .command('bootstrap')
    .description('Guided setup for vault providers');

  bootstrap
    .command('azure')
    .description('Generate Azure CLI steps for creating a Key Vault + app registration')
    .option('--vault-name <name>', 'Azure Key Vault name (global namespace)', '')
    .option('--resource-group <name>', 'Azure resource group', '')
    .option('--location <region>', 'Azure region (e.g. eastus)', 'eastus')
    .option('--subscription-id <id>', 'Azure subscription ID (scope for role assignment)')
    .option('--app-name <name>', 'Service principal display name', '')
    .option('--output <mode>', 'Output format: text|json', 'text')
    .option('--verify', 'Verify connectivity after following the steps', false)
    .option('--interactive', 'Prompt for inputs and walk you through each step', false)
    .action(async (opts) => {
      const workspace = requireWorkspace();
      await runAzureBootstrapWizard({
        workspace,
        vaultName: opts.vaultName,
        resourceGroup: opts.resourceGroup,
        location: opts.location,
        subscriptionId: opts.subscriptionId,
        appName: opts.appName,
        output: opts.output === 'json' ? 'json' : 'text',
        verify: opts.verify,
        interactive: opts.interactive,
      });
    });
}
