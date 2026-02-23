import { spawnSync } from 'node:child_process';
import type { StdioOptions } from 'node:child_process';
import { join } from 'node:path';
import type { WorkspaceContext } from '../cli-shared.js';
import { getVaultProvider, _resetVaultProvider } from '../../vault/index.js';
import { writeWorkspaceConfig } from '../../workspace/config.js';
import { persistAzureWorkspaceEnv } from '../../workspace/env.js';

export type VaultProviderName = 'dev' | 'file' | 'azure';

type WorkspaceDescriptor = Pick<WorkspaceContext, 'paths' | 'config'>;

interface CommandSpec {
  cmd: string;
  args: string[];
  capture?: 'json' | 'text';
  passthrough?: boolean;
}

interface CommandResult {
  success: boolean;
  output?: string;
  errorOutput?: string;
}

interface AzureWizardStep {
  id: string;
  title: string;
  command: string;
  exec?: CommandSpec;
}

interface AzureVaultSummary {
  name: string;
  resourceGroup?: string;
  location?: string;
}

interface VaultSelectionContext {
  vaultName: string;
  resourceGroup: string;
  location: string;
  subscriptionId?: string;
}

interface VaultSelectionResult extends VaultSelectionContext {
  adopted: boolean;
  prompted: boolean;
}

interface StepRunOptions {
  tenantHint?: string;
}

interface AzureAccountInfo {
  subscriptionId?: string;
  tenantId?: string;
  name?: string;
  user?: string;
}

type InquirerInstance = typeof import('inquirer')['default'];

function commandOutputText(result: CommandResult): string {
  return `${result.output ?? ''} ${result.errorOutput ?? ''}`.toLowerCase();
}

function needsAzureLogin(result: CommandResult): boolean {
  if (result.success) return false;
  const text = commandOutputText(result);
  if (!text.trim()) return false;
  return (
    text.includes('az login') ||
    text.includes('aadsts') ||
    text.includes('token has expired') ||
    text.includes('interactive authentication')
  );
}

function quoteForDisplay(value: string): string {
  const safe = value.replace(/"/g, '\\"');
  return /\s/.test(safe) ? `"${safe}"` : safe;
}

function runCommandInline(spec: CommandSpec): CommandResult {
  console.log(`\n> ${spec.cmd} ${spec.args.map((arg) => quoteForDisplay(arg)).join(' ')}`);
  const captureStdout = !spec.passthrough;
  const stdio: StdioOptions = spec.passthrough ? 'inherit' : ['inherit', 'pipe', 'pipe'];
  try {
    const result = spawnSync(spec.cmd, spec.args, { stdio, encoding: 'utf8' });
    if (result.error) {
      console.error(`Failed to run ${spec.cmd}: ${result.error.message}`);
      return { success: false };
    }
    const output = captureStdout ? result.stdout?.toString() ?? '' : undefined;
    const errorOutput = captureStdout ? result.stderr?.toString() ?? '' : undefined;
    const success = result.status === 0;
    if (captureStdout && output?.trim()) {
      console.log(output.trim());
    }
    if (captureStdout && errorOutput?.trim()) {
      console.error(errorOutput.trim());
    }
    if (!success) {
      console.error(`${spec.cmd} exited with status ${result.status}.`);
    }
    return { success, output, errorOutput };
  } catch (err) {
    console.error(`Unable to run ${spec.cmd}: ${(err as Error).message}`);
    return { success: false };
  }
}

let cachedAzureCliAvailable: boolean | null = null;

function azureCliAvailable(): boolean {
  if (cachedAzureCliAvailable !== null) return cachedAzureCliAvailable;
  try {
    const check = spawnSync('az', ['--version'], { stdio: 'ignore' });
    cachedAzureCliAvailable = !check.error && check.status === 0;
    return cachedAzureCliAvailable;
  } catch {
    cachedAzureCliAvailable = false;
    return false;
  }
}

function validSubscriptionId(value?: string): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !trimmed.startsWith('<');
}

function withSubscription(args: string[], subscriptionId?: string): string[] {
  if (!validSubscriptionId(subscriptionId)) return args;
  return [...args, '--subscription', subscriptionId];
}

function listAzureKeyVaults(subscriptionId?: string): AzureVaultSummary[] {
  if (!azureCliAvailable()) return [];
  try {
    const args = withSubscription(
      [
        'keyvault',
        'list',
        '--query',
        '[].{name:name,resourceGroup:resourceGroup,location:location}',
        '--output',
        'json',
      ],
      subscriptionId,
    );
    const result = spawnSync('az', args, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
    if (result.error || result.status !== 0) return [];
    const parsed = JSON.parse(result.stdout || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item?.name === 'string');
  } catch {
    return [];
  }
}

function getAzureAccountInfo(): AzureAccountInfo | null {
  if (!azureCliAvailable()) return null;
  try {
    const result = spawnSync('az', ['account', 'show', '--output', 'json'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    if (result.error || result.status !== 0) return null;
    const parsed = JSON.parse(result.stdout || '{}');
    if (typeof parsed !== 'object' || !parsed) return null;
    return {
      subscriptionId: typeof parsed.id === 'string' ? parsed.id : undefined,
      tenantId: typeof parsed.tenantId === 'string' ? parsed.tenantId : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      user: typeof parsed.user?.name === 'string' ? parsed.user.name : undefined,
    };
  } catch {
    return null;
  }
}

async function ensureAzureAccountInfo(
  inquirer: InquirerInstance,
  opts: { tenantHint?: string } = {},
): Promise<AzureAccountInfo | null> {
  if (!azureCliAvailable()) return null;
  let info = getAzureAccountInfo();
  if (info) return info;
  console.log('\nAzure CLI is installed but not authenticated yet.');
  const loggedIn = await promptAzureLogin(inquirer, { tenantHint: opts.tenantHint });
  if (!loggedIn) return null;
  info = getAzureAccountInfo();
  if (info?.subscriptionId) {
    const subscriptionLabel = info.name ? `${info.subscriptionId} (${info.name})` : info.subscriptionId;
    console.log(`Azure CLI account ready – using subscription ${subscriptionLabel}.`);
  }
  return info;
}

async function ensureAzureSubscriptionContext(
  inquirer: InquirerInstance,
  desiredSubscriptionId?: string,
): Promise<void> {
  if (!azureCliAvailable() || !validSubscriptionId(desiredSubscriptionId)) return;
  const current = getAzureAccountInfo();
  if (current?.subscriptionId === desiredSubscriptionId) return;
  const currentLabel = current?.subscriptionId
    ? `${current.subscriptionId}${current?.name ? ` (${current.name})` : ''}`
    : 'unknown';
  console.log(`\nAzure CLI currently targeting subscription ${currentLabel}.`);
  const { switchNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'switchNow',
      message: `Switch Azure CLI context to subscription ${desiredSubscriptionId}?`,
      default: true,
    },
  ]);
  if (!switchNow) {
    console.log('Continuing with current Azure CLI subscription context.');
    return;
  }
  const result = runCommandInline({
    cmd: 'az',
    args: ['account', 'set', '--subscription', desiredSubscriptionId],
    passthrough: true,
  });
  if (result.success) {
    console.log('Azure CLI subscription updated.');
  } else {
    console.log('Unable to switch subscription automatically. Run `az account set --subscription <id>` and retry if needed.');
  }
}

function azureResourceGroupExists(name: string, subscriptionId?: string): boolean {
  if (!azureCliAvailable()) return false;
  try {
    const args = withSubscription(['group', 'exists', '--name', name], subscriptionId);
    const result = spawnSync('az', args, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
    if (result.error || result.status !== 0) return false;
    return result.stdout.trim() === 'true';
  } catch {
    return false;
  }
}

function azureKeyVaultExists(name: string, subscriptionId?: string): boolean {
  if (!azureCliAvailable()) return false;
  try {
    const args = withSubscription(
      ['keyvault', 'show', '--name', name, '--query', 'name', '--output', 'tsv'],
      subscriptionId,
    );
    const result = spawnSync('az', args, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
    if (result.error || result.status !== 0) return false;
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function maybeAdoptExistingVault(
  inquirer: InquirerInstance,
  ctx: VaultSelectionContext,
): Promise<VaultSelectionResult> {
  const vaults = listAzureKeyVaults(ctx.subscriptionId);
  if (!vaults.length) {
    return { ...ctx, adopted: false, prompted: false };
  }
  const limited = vaults.slice(0, 10);
  if (vaults.length > limited.length) {
    console.log(
      `Detected ${vaults.length} Key Vaults in this subscription. Showing the first ${limited.length} entries.`,
    );
  }
  const choices = [
    {
      name: `Create new Key Vault named ${ctx.vaultName}`,
      value: '__new',
    },
    ...limited.map((vault) => ({
      name: `${vault.name} (rg: ${vault.resourceGroup ?? 'unknown'}, ${vault.location ?? 'unknown region'})`,
      value: vault.name,
    })),
  ];
  const { selectedVault } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedVault',
      message: 'Detected existing Key Vaults. Reuse one or create a new vault?',
      choices,
      default: '__new',
    },
  ]);
  if (selectedVault === '__new') {
    return { ...ctx, adopted: false, prompted: true };
  }
  const match = vaults.find((vault) => vault.name === selectedVault);
  if (!match) {
    return { ...ctx, adopted: false, prompted: true };
  }
  console.log(`\nReusing existing Key Vault ${match.name} (resource group ${match.resourceGroup ?? 'unknown'}).`);
  return {
    vaultName: match.name,
    resourceGroup: match.resourceGroup ?? ctx.resourceGroup,
    location: match.location ?? ctx.location,
    subscriptionId: ctx.subscriptionId,
    adopted: true,
    prompted: true,
  };
}

async function promptAzureLogin(
  inquirer: InquirerInstance,
  opts: { tenantHint?: string } = {},
): Promise<boolean> {
  console.log('\nAzure CLI reported that your authentication expired or is missing.');
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'How would you like to proceed?',
      choices: [
        { name: 'Run `az login` (device code flow) now', value: 'login' },
        { name: 'Show me the command so I can run it manually', value: 'manual' },
        { name: 'Skip for now', value: 'skip' },
      ],
      default: 'login',
    },
  ]);

  if (action === 'manual') {
    const hintTenant = opts.tenantHint ?? process.env['AZURE_TENANT_ID'] ?? '<tenant-id>'; 
    console.log('\nRun the following in another terminal:');
    console.log(`  az logout`);
    console.log(`  az login --tenant ${hintTenant}`);
    console.log('Once done, return here and retry the failed step.');
    return false;
  }
  if (action !== 'login') return false;

  const { tenantId } = await inquirer.prompt([
    {
      type: 'input',
      name: 'tenantId',
      message: 'Tenant ID for az login (leave blank to use default profile)',
      default: opts.tenantHint ?? process.env['AZURE_TENANT_ID'] ?? '',
    },
  ]);
  const args = ['login', '--use-device-code'];
  if (tenantId.trim()) {
    args.push('--tenant', tenantId.trim());
  }
  console.log('\nLaunching az login (device code). Follow the instructions shown.');
  const result = runCommandInline({ cmd: 'az', args, passthrough: true });
  if (result.success) {
    cachedAzureCliAvailable = true;
    console.log('Azure login complete.');
    return true;
  }
  console.log('Azure login failed. You can retry or select another option.');
  const { retry } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'retry',
      message: 'Try az login again?',
      default: true,
    },
  ]);
  if (retry) {
    return promptAzureLogin(inquirer, { tenantHint: tenantId.trim() || opts.tenantHint });
  }
  return false;
}

function confirmStepPrompt(
  inquirer: InquirerInstance,
  message = 'Completed this step?',
): Promise<{ done: boolean }> {
  return inquirer.prompt([
    {
      type: 'confirm',
      name: 'done',
      message,
      default: true,
    },
  ]);
}

async function runStepAutomatically(
  inquirer: InquirerInstance,
  step: AzureWizardStep,
  opts: StepRunOptions = {},
): Promise<CommandResult> {
  if (!step.exec) return { success: false };
  while (true) {
    const result = runCommandInline(step.exec);
    if (result.success) return result;
    if (needsAzureLogin(result)) {
      const relogged = await promptAzureLogin(inquirer, { tenantHint: opts.tenantHint });
      if (relogged) {
        cachedAzureCliAvailable = true;
        continue;
      }
    }
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Command failed. What would you like to do?',
        choices: [
          { name: 'Retry command', value: 'retry' },
          { name: 'Mark step complete manually', value: 'manual' },
          { name: 'Cancel wizard', value: 'cancel' },
        ],
        default: 'retry',
      },
    ]);
    if (action === 'retry') continue;
    if (action === 'manual') {
      const { done } = await confirmStepPrompt(inquirer);
      return { success: done };
    }
    return { success: false };
  }
}

export function resolveVaultPath(workspaceRoot: string): string {
  return join(workspaceRoot, 'vault.dev.json');
}

export async function switchWorkspaceVaultProvider(
  workspace: WorkspaceDescriptor,
  providerName: VaultProviderName,
  opts?: { filePath?: string },
): Promise<{ provider: string; healthy: boolean; message?: string }> {
  const allowed: VaultProviderName[] = ['dev', 'file', 'azure'];
  if (!allowed.includes(providerName)) {
    throw new Error('Unsupported provider. Use dev, file, or azure.');
  }

  const updated = { ...workspace.config, vault_provider: providerName };
  writeWorkspaceConfig(workspace.paths.config, updated);
  _resetVaultProvider();

  const provider = getVaultProvider({
    provider: providerName,
    filePath: opts?.filePath ?? resolveVaultPath(workspace.paths.root),
  });
  return provider.status();
}

export interface AzureBootstrapOptions {
  workspace: WorkspaceDescriptor;
  vaultName?: string;
  resourceGroup?: string;
  location?: string;
  subscriptionId?: string;
  appName?: string;
  output?: 'text' | 'json';
  verify?: boolean;
  interactive?: boolean;
}

export async function runAzureBootstrapWizard(opts: AzureBootstrapOptions): Promise<void> {
  const workspace = opts.workspace;
  const slug = workspace.config.workspace_id.slice(0, 8).toLowerCase();
  const interactive = Boolean(opts.interactive);
  const defaultVaultName = opts.vaultName || `cloned-${slug}`;
  const defaultResourceGroup = opts.resourceGroup || `cloned-rg-${slug}`;
  const defaultAppName = opts.appName || `cloned-sp-${slug}`;
  let location = opts.location ?? 'eastus';
  let vaultName = defaultVaultName.trim();
  let resourceGroup = defaultResourceGroup.trim();
  let subscriptionId =
    (opts.subscriptionId ?? process.env['AZURE_SUBSCRIPTION_ID'] ?? '<subscription-id>').trim();
  let appName = defaultAppName.trim();
  let shouldVerify = Boolean(opts.verify);
  let tenantHint = process.env['AZURE_TENANT_ID'] ?? '';

  if (interactive) {
    const { default: inquirer } = await import('inquirer');
    const accountInfo = await ensureAzureAccountInfo(inquirer, { tenantHint });
    if (accountInfo?.subscriptionId) {
      subscriptionId = accountInfo.subscriptionId.trim();
    }
    if (accountInfo?.tenantId) {
      tenantHint = accountInfo.tenantId.trim();
    }

    const initialSelection = await maybeAdoptExistingVault(inquirer, {
      vaultName,
      resourceGroup,
      location,
      subscriptionId,
    });
    let adoptionPromptShown = initialSelection.prompted;
    let adoptedExistingVault = initialSelection.adopted;
    ({ vaultName, resourceGroup, location } = initialSelection);

    const questions: any[] = [];
    if (!adoptedExistingVault) {
      questions.push(
        {
          type: 'input',
          name: 'vaultName',
          message: 'Key Vault name',
          default: vaultName,
          validate: (val: string) => val.trim().length >= 3 || 'Enter a vault name (min 3 characters)',
        },
        {
          type: 'input',
          name: 'resourceGroup',
          message: 'Resource group',
          default: resourceGroup,
          validate: (val: string) => val.trim().length > 0 || 'Resource group is required',
        },
        {
          type: 'input',
          name: 'location',
          message: 'Azure region',
          default: location,
          validate: (val: string) => val.trim().length > 0 || 'Location is required',
        },
      );
    } else {
      console.log(
        `Using existing Key Vault ${vaultName} (resource group ${resourceGroup || 'unknown'}). You can re-run the wizard to create a new one if needed.`,
      );
    }

    questions.push(
      {
        type: 'input',
        name: 'subscriptionId',
        message: 'Subscription ID (from Azure portal)',
        default: subscriptionId,
        validate: (val: string) => val.trim().length > 0 || 'Subscription ID is required',
      },
      {
        type: 'input',
        name: 'appName',
        message: 'Service principal display name (new or existing)',
        default: appName,
        validate: (val: string) => val.trim().length > 0 || 'App name is required',
      },
      {
        type: 'confirm',
        name: 'verifyAfter',
        message: 'Verify connectivity after the wizard completes?',
        default: true,
      },
    );

    const responses = await inquirer.prompt(questions);

    if (!adoptedExistingVault) {
      vaultName = (responses.vaultName ?? vaultName).trim();
      resourceGroup = (responses.resourceGroup ?? resourceGroup).trim();
      location = (responses.location ?? location).trim();
    }
    subscriptionId = responses.subscriptionId.trim();
    appName = responses.appName.trim();
    shouldVerify = shouldVerify || responses.verifyAfter;

    if (!adoptedExistingVault && !adoptionPromptShown) {
      const followUpSelection = await maybeAdoptExistingVault(inquirer, {
        vaultName,
        resourceGroup,
        location,
        subscriptionId,
      });
      ({ vaultName, resourceGroup, location } = followUpSelection);
      adoptedExistingVault = followUpSelection.adopted;
      adoptionPromptShown = followUpSelection.prompted || adoptionPromptShown;
    }

    await ensureAzureSubscriptionContext(inquirer, subscriptionId);

    if (opts.output === 'json') {
      console.log('Interactive mode uses text output. Ignoring --output json for this run.');
    }
  }

  const vaultUri = `https://${vaultName}.vault.azure.net/`;

  const scope =
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}` +
    `/providers/Microsoft.KeyVault/vaults/${vaultName}`;

  const steps: AzureWizardStep[] = [
    {
      id: '1',
      title: 'Create (or reuse) a resource group',
      command:
        `az group create --name ${quoteForDisplay(resourceGroup)} --location ${quoteForDisplay(location)}`,
      exec: {
        cmd: 'az',
        args: withSubscription(
          ['group', 'create', '--name', resourceGroup, '--location', location],
          subscriptionId,
        ),
      },
    },
    {
      id: '2',
      title: 'Create the Azure Key Vault (RBAC enabled)',
      command:
        `az keyvault create --name ${quoteForDisplay(vaultName)} --resource-group ${quoteForDisplay(resourceGroup)} ` +
        `--location ${quoteForDisplay(location)} --enable-rbac-authorization true`,
      exec: {
        cmd: 'az',
        args: withSubscription(
          [
            'keyvault',
            'create',
            '--name',
            vaultName,
            '--resource-group',
            resourceGroup,
            '--location',
            location,
            '--enable-rbac-authorization',
            'true',
          ],
          subscriptionId,
        ),
      },
    },
    {
      id: '3',
      title: 'Create (or reuse) a service principal scoped to the vault',
      command:
        `az ad sp create-for-rbac --name ${quoteForDisplay(appName)} --role "Key Vault Secrets Officer" ` +
        `--scopes ${quoteForDisplay(scope)} --output json`,
      exec: {
        cmd: 'az',
        args: [
          'ad',
          'sp',
          'create-for-rbac',
          '--name',
          appName,
          '--role',
          'Key Vault Secrets Officer',
          '--scopes',
          scope,
          '--output',
          'json',
        ],
        capture: 'json',
      },
    },
    {
      id: '4',
      title: 'Export the resulting credentials for Cloned',
      command:
        `export AZURE_KEYVAULT_URI=${vaultUri}\n` +
        'export AZURE_CLIENT_ID=<appId>\n' +
        'export AZURE_TENANT_ID=<tenant>\n' +
        'export AZURE_CLIENT_SECRET=<password>',
    },
    {
      id: '5',
      title: 'Switch the workspace to Azure Key Vault',
      command: 'cloned vault provider azure',
    },
    {
      id: '6',
      title: 'Verify connectivity',
      command: 'cloned vault status',
    },
  ];

  const payload = {
    provider: 'azure',
    workspace_id: workspace.config.workspace_id,
    inputs: {
      vault_name: vaultName,
      resource_group: resourceGroup,
      location,
      subscription_id: subscriptionId,
      app_name: appName,
    },
    exports: {
      AZURE_KEYVAULT_URI: vaultUri,
      AZURE_CLIENT_ID: '<from-step-3-appId>',
      AZURE_TENANT_ID: '<from-step-3-tenant>',
      AZURE_CLIENT_SECRET: '<from-step-3-password>',
    },
    steps,
    notes: [
      'We never see your Azure credentials. All commands run in your tenant.',
      'Key Vault names are globally unique. Pick a different name if Azure rejects it.',
    ],
  };

  if (opts.output === 'json' && !interactive) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('\nAzure Key Vault bootstrap plan:\n');
    console.log(`  Workspace ID: ${payload.workspace_id}`);
    console.log(`  Vault name:   ${vaultName}`);
    console.log(`  Resource grp: ${resourceGroup}`);
    console.log(`  Region:       ${location}`);
    console.log('\nSteps:');
    for (const step of steps) {
      console.log(`  ${step.id}. ${step.title}`);
      console.log(`     ${step.command}`);
    }
    console.log('\nAfter running the commands above, export the variables shown in step 4, then run:');
    console.log('  cloned vault provider azure');
    console.log('  cloned vault status');
    if (interactive) {
      console.log('\nLaunching interactive helper...');
    }
  }

  if (interactive) {
    const { default: inquirer } = await import('inquirer');
    const azCliDetected = azureCliAvailable();
    let executionMode: 'auto' | 'manual' = azCliDetected ? 'auto' : 'manual';
    if (!azCliDetected) {
      console.log('\nAzure CLI not detected. Falling back to manual command entry.');
    } else {
      const { preferredMode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'preferredMode',
          message: 'Run Azure CLI steps automatically using your local session?',
          choices: [
            {
              name: 'Yes – run the commands for me (requires az login)',
              value: 'auto',
            },
            {
              name: 'No – I will run commands manually and mark them complete',
              value: 'manual',
            },
          ],
          default: 'auto',
        },
      ]);
      executionMode = preferredMode;
    }

    if (executionMode === 'auto') {
      console.log(
        '\nThe wizard will run the Azure CLI commands for you. Sit tight and approve any login prompts that appear. We will pause if something needs your attention.\n',
      );
    } else {
      console.log(
        '\nRun each Azure CLI command in another terminal (Cloud Shell or local az) and mark the step complete here when finished.\n',
      );
    }
    let resourceGroupExistsAlready =
      azCliDetected && azureResourceGroupExists(resourceGroup, subscriptionId);
    let keyVaultExistsAlready = azCliDetected && azureKeyVaultExists(vaultName, subscriptionId);
    let capturedSpCreds: { clientId: string; tenantId: string; clientSecret: string } | null = null;
    for (const step of steps.filter((s) => Number(s.id) <= 4)) {
      if (step.id === '1' && azCliDetected && !resourceGroupExistsAlready) {
        resourceGroupExistsAlready = azureResourceGroupExists(resourceGroup, subscriptionId);
      }
      if (step.id === '2' && azCliDetected && !keyVaultExistsAlready) {
        keyVaultExistsAlready = azureKeyVaultExists(vaultName, subscriptionId);
      }
      console.log(`Step ${step.id}: ${step.title}`);
      const renderedCommand = step.command.split('\n').map((line) => `   ${line}`).join('\n');
      if (executionMode === 'auto' && step.id === '4') {
        console.log('   (The wizard handles exporting credentials and switching providers automatically.)');
        continue;
      }
      console.log(renderedCommand);
      if (step.id === '1' && resourceGroupExistsAlready) {
        console.log(`   (${resourceGroup} already exists in this subscription.)`);
        if (executionMode === 'auto') {
          console.log('   Skipping creation step.');
          resourceGroupExistsAlready = true;
          continue;
        }
      }
      if (step.id === '2' && keyVaultExistsAlready) {
        console.log(`   (${vaultName} already exists. Skipping creation when auto-running.)`);
        if (executionMode === 'auto') {
          keyVaultExistsAlready = true;
          continue;
        }
      }
      if (executionMode === 'auto' && step.exec) {
        const finished = await runStepAutomatically(inquirer, step, { tenantHint });
        if (!finished.success) {
          console.log('Wizard paused. Re-run the wizard when ready.');
          return;
        }
        if (step.id === '1') resourceGroupExistsAlready = true;
        if (step.id === '2') keyVaultExistsAlready = true;
        if (step.id === '3' && finished.output) {
          try {
            const parsed = JSON.parse(finished.output);
            if (parsed?.appId && parsed?.tenant && parsed?.password) {
              capturedSpCreds = {
                clientId: String(parsed.appId).trim(),
                tenantId: String(parsed.tenant).trim(),
                clientSecret: String(parsed.password).trim(),
              };
              tenantHint = capturedSpCreds.tenantId;
              console.log('Captured service principal credentials from Azure CLI output.');
            } else {
              console.log('Azure CLI output missing expected fields; you may need to enter credentials manually.');
            }
          } catch (err) {
            console.log(
              `Could not parse Azure CLI output (${(err as Error).message}). You may need to enter credentials manually.`,
            );
          }
        }
        continue;
      }
      const { done } = await confirmStepPrompt(inquirer);
      if (!done) {
        console.log('Wizard paused. Re-run the command when ready.');
        return;
      }
      if (step.id === '1') resourceGroupExistsAlready = true;
      if (step.id === '2') keyVaultExistsAlready = true;
    }

    let clientId = process.env['AZURE_CLIENT_ID'] ?? '';
    let tenantId = process.env['AZURE_TENANT_ID'] ?? '';
    let clientSecret = process.env['AZURE_CLIENT_SECRET'] ?? '';
    if (capturedSpCreds) {
      ({ clientId, tenantId, clientSecret } = capturedSpCreds);
      console.log('\nUsing credentials returned by Azure CLI.');
    } else {
      console.log('\nGreat! Paste the values from the `az ad sp create-for-rbac` output so we can finish configuration.');
      const creds = await inquirer.prompt([
        {
          type: 'input',
          name: 'clientId',
          message: 'AZURE_CLIENT_ID (appId)',
          default: clientId,
          validate: (val: string) => val.trim().length > 0 || 'Client ID is required',
        },
        {
          type: 'input',
          name: 'tenantId',
          message: 'AZURE_TENANT_ID (tenant)',
          default: tenantId,
          validate: (val: string) => val.trim().length > 0 || 'Tenant ID is required',
        },
        {
          type: 'password',
          name: 'clientSecret',
          message: 'AZURE_CLIENT_SECRET (password)',
          mask: '*',
          default: clientSecret,
          validate: (val: string) => val.trim().length > 0 || 'Client secret is required',
        },
      ]);
      clientId = creds.clientId.trim();
      tenantId = creds.tenantId.trim();
      clientSecret = creds.clientSecret.trim();
      tenantHint = tenantId;
    }

    process.env['AZURE_KEYVAULT_URI'] = vaultUri;
    process.env['AZURE_CLIENT_ID'] = clientId;
    process.env['AZURE_TENANT_ID'] = tenantId;
    process.env['AZURE_CLIENT_SECRET'] = clientSecret;

    try {
      const storedPath = persistAzureWorkspaceEnv(workspace.paths.root, {
        keyvaultUri: vaultUri,
        clientId,
        tenantId,
        clientSecret,
      });
      console.log(`Saved Azure credentials to ${storedPath} (chmod 600).`);
    } catch (err) {
      console.warn('Warning: could not persist Azure credentials:', (err as Error).message);
    }

    console.log('\nSwitching workspace provider to Azure and verifying connectivity...');
    const status = await switchWorkspaceVaultProvider(workspace, 'azure');
    console.log(`\nVault Provider: ${status.provider}`);
    console.log(`Status: ${status.healthy ? 'healthy' : 'unhealthy'}`);
    if (status.message) console.log(`Message: ${status.message}`);
    console.log('\nAzure Key Vault onboarding complete. Run `cloned vault status` anytime to re-check.');
    return;
  }

  if (shouldVerify) {
    console.log('\nVerifying Azure Key Vault connectivity...');
    try {
      _resetVaultProvider();
      const provider = getVaultProvider({
        provider: 'azure',
        filePath: resolveVaultPath(workspace.paths.root),
      });
      const status = await provider.status();
      if (status.healthy) {
        console.log('Azure Key Vault reachable.');
      } else {
        console.log('Azure Key Vault reported unhealthy status:', status.message ?? 'unknown error');
      }
    } catch (err) {
      console.error(`Failed to verify Azure Key Vault: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
}
