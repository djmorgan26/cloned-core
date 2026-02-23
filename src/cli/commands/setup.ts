import type { Command } from 'commander';
import { existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { getClonedPaths } from '../../workspace/paths.js';
import { readWorkspaceConfig } from '../../workspace/config.js';
import type { WorkspaceContext } from '../cli-shared.js';
import { initWorkspace } from '../../workspace/init.js';
import type { WorkspaceTier } from '../../workspace/types.js';
import { runDoctorChecks, type DoctorReport, type DoctorCheck } from '../../runtime/doctor.js';
import { getVaultProvider } from '../../vault/index.js';
import {
  runAzureBootstrapWizard,
  resolveVaultPath,
} from '../helpers/vault-wizard.js';

type InstallMode = 'docker' | 'local';

type SetupWorkspace = Pick<WorkspaceContext, 'paths' | 'config'>;

interface SetupContext {
  workspace: SetupWorkspace | null;
  installMode: InstallMode;
}

interface SetupStep {
  id: string;
  title: string;
  description: string;
  run: (ctx: SetupContext) => Promise<boolean>;
}

function tryLoadWorkspace(): SetupWorkspace | null {
  const paths = getClonedPaths();
  if (!existsSync(paths.config)) return null;
  try {
    const config = readWorkspaceConfig(paths.config);
    return { paths, config };
  } catch {
    return null;
  }
}

function explainWorkspaceTier(): void {
  console.log(
    '\nWorkspace tiers:\n' +
      '  • Personal – single developer running on a laptop/desktop.\n' +
      '  • Shared – small team sharing budgets/approvals.\n' +
      '  • Enterprise – hardened environment with stricter governance.\n',
  );
}

async function promptWorkspaceTier(): Promise<WorkspaceTier> {
  const { default: inquirer } = await import('inquirer');
  while (true) {
    const { tier } = await inquirer.prompt([
      {
        type: 'list',
        name: 'tier',
        message: 'Workspace tier',
        default: 'personal',
        choices: [
          { name: 'Personal (single user)', value: 'personal' },
          { name: 'Shared (team)', value: 'shared' },
          { name: 'Enterprise', value: 'enterprise' },
          { name: 'Explain these tiers', value: '__explain' },
        ],
      },
    ]);
    if (tier === '__explain') {
      explainWorkspaceTier();
      continue;
    }
    return tier as WorkspaceTier;
  }
}

async function runWorkspaceInit(ctx: SetupContext): Promise<boolean> {
  const { default: inquirer } = await import('inquirer');
  const paths = getClonedPaths();
  const workspaceExists = existsSync(paths.root);
  const existing = ctx.workspace ?? tryLoadWorkspace();
  if (workspaceExists) {
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: '.cloned/ already exists – what would you like to do?',
        choices: [
          { name: 'Reuse existing workspace (recommended)', value: 'reuse' },
          { name: 'Reinitialize (destructive, overwrite config/state)', value: 'reinit' },
          { name: 'Cancel', value: 'cancel' },
        ],
        default: 'reuse',
      },
    ]);
    if (mode === 'reuse') {
      console.log('Keeping existing workspace.');
      ctx.workspace = existing ?? tryLoadWorkspace();
      return true;
    }
    if (mode === 'cancel') return false;
    console.log('Reinitializing existing workspace...');
  }

  const tier = await promptWorkspaceTier();

  await initWorkspace({ type: tier, force: workspaceExists });
  console.log(`Workspace initialized (${tier}).`);
  ctx.workspace = tryLoadWorkspace();
  return true;
}

function ensureWorkspace(ctx: SetupContext): SetupWorkspace | null {
  if (!ctx.workspace) {
    ctx.workspace = tryLoadWorkspace();
  }
  return ctx.workspace;
}

type DoctorFixer = (ctx: SetupContext, check: DoctorCheck) => Promise<boolean>;

interface LlmProviderConfig {
  id: string;
  label: string;
  apiKey: string;
  apiBase?: string;
}

interface OllamaDetection {
  installed: boolean;
  version?: string;
  models: string[];
}

interface PromptTextOptions {
  message: string;
  defaultValue?: string;
  required?: boolean;
  validate?: (value: string) => true | string;
  type?: 'input' | 'password';
  mask?: string;
}

function isBackCommand(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'back' || normalized === ':back';
}

async function promptTextWithBack(options: PromptTextOptions): Promise<string | null> {
  const { default: inquirer } = await import('inquirer');
  const question = {
    type: options.type ?? 'input',
    name: 'value',
    message: `${options.message} (type ':back' to go back)`,
    default: options.defaultValue,
    mask: options.mask,
    validate: (input: string) => {
      const trimmed = input?.trim() ?? '';
      if (isBackCommand(trimmed)) return true;
      if (options.validate) return options.validate(trimmed);
      if (options.required === false || trimmed.length > 0) return true;
      return 'Value is required';
    },
  } as const;
  const { value } = await inquirer.prompt([question]);
  const trimmed = (value ?? '').trim();
  if (isBackCommand(trimmed)) return null;
  if (!trimmed && options.defaultValue) return options.defaultValue;
  return trimmed;
}

function printDoctorReport(report: DoctorReport): void {
  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    console.log(`${icon} ${check.name} – ${check.message}`);
    if (check.fix) console.log(`   Fix: ${check.fix}`);
  }
  console.log(`Overall: ${report.overall.toUpperCase()} – ${report.summary}`);
}

async function promptDoctorLoop(ctx: SetupContext, initialReport: DoctorReport): Promise<void> {
  const { default: inquirer } = await import('inquirer');
  let report = initialReport;

  while (true) {
    printDoctorReport(report);
    const issues = report.checks.filter((check) => check.status !== 'pass');
    if (issues.length === 0) {
      console.log('All doctor checks passed.');
      return;
    }

    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'Doctor reported warnings/failures – what would you like to do?',
        choices: [
          { name: 'Guide me through a fix', value: 'fix' },
          { name: 'Re-run doctor now', value: 'rerun' },
          { name: 'Return to setup menu', value: 'exit' },
        ],
      },
    ]);

    if (nextAction === 'exit') return;
    if (nextAction === 'rerun') {
      console.log('\nRe-running doctor checks...');
      report = await runDoctorChecks();
      continue;
    }

    const { checkToFix } = await inquirer.prompt([
      {
        type: 'list',
        name: 'checkToFix',
        message: 'Select an item to fix:',
        choices: issues.map((issue) => ({
          name: `${issue.name} – ${issue.message}`,
          value: issue.name,
        })),
      },
    ]);
    const check = issues.find((issue) => issue.name === checkToFix);
    if (!check) continue;

    const fixed = await runDoctorFixer(ctx, check);
    if (fixed) {
      console.log('Re-running doctor to verify the fix...');
      report = await runDoctorChecks();
    }
  }
}

const DOCTOR_FIXERS: Record<string, DoctorFixer> = {
  'Workspace initialized (.cloned/)': fixWorkspaceDirectory,
  'SQLite WAL mode enabled': fixSqliteBindings,
  'LLM API key configured': fixLlmApiKey,
  'gitleaks available': fixGitleaks,
};

async function runDoctorFixer(ctx: SetupContext, check: DoctorCheck): Promise<boolean> {
  const fixer = DOCTOR_FIXERS[check.name];
  if (!fixer) {
    if (check.fix) console.log(`Follow the guidance above: ${check.fix}`);
    console.log('See docs/runtime/containers.md and getting-started.md for manual remediation steps.');
    return false;
  }
  const success = await fixer(ctx, check);
  if (!success && check.fix) {
    console.log(`Tip: ${check.fix}`);
  }
  return success;
}

function runInteractiveCommand(cmd: string, args: string[]): boolean {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`Failed to run ${cmd}: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`${cmd} exited with status ${result.status}.`);
    return false;
  }
  return true;
}

function detectLocalAiContainer(): boolean {
  try {
    const result = spawnSync(
      'docker',
      ['ps', '--filter', 'name=cloned-localai', '--format', '{{.ID}}'],
      { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' },
    );
    if (result.error || result.status !== 0) return false;
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function detectOllama(): OllamaDetection {
  try {
    const versionResult = spawnSync('ollama', ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    if (versionResult.error || versionResult.status !== 0) {
      return { installed: false, models: [] };
    }
    const models = listOllamaModels();
    return { installed: true, version: versionResult.stdout.trim(), models };
  } catch {
    return { installed: false, models: [] };
  }
}

function listOllamaModels(): string[] {
  const quietAttempt = runOllamaList(['list', '--quiet']);
  if (quietAttempt.ok) return quietAttempt.models;
  const fallback = runOllamaList(['list']);
  return fallback.ok ? fallback.models : [];
}

function runOllamaList(args: string[]): { ok: boolean; models: string[] } {
  try {
    const result = spawnSync('ollama', args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    if (result.error || result.status !== 0) {
      return { ok: false, models: [] };
    }
    return { ok: true, models: parseOllamaListOutput(result.stdout) };
  } catch {
    return { ok: false, models: [] };
  }
}

function parseOllamaListOutput(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(name|model)\b/i.test(line))
    .map((line) => (line.split(/\s+/)[0] ?? '').trim())
    .filter((name) => name.length > 0);
}

function printOllamaModelSummary(models: string[]): void {
  if (!models.length) {
    console.log('No Ollama models detected. Install at least one model to run local LLMs.');
    return;
  }
  console.log('Detected Ollama models:');
  models.slice(0, 5).forEach((model) => console.log(`  • ${model}`));
  if (models.length > 5) {
    console.log(`  (${models.length - 5} more not shown)`);
  }
}

async function ensureOllamaReady(): Promise<OllamaDetection | null> {
  const { default: inquirer } = await import('inquirer');
  let detection = detectOllama();

  while (!detection.installed) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Ollama CLI not detected. Install it now?',
        choices: [
          {
            name: 'Install via Homebrew (brew install ollama)',
            value: 'brew',
            disabled: process.platform === 'darwin' ? undefined : 'macOS only',
          },
          { name: 'Open installation instructions (https://ollama.com/download)', value: 'manual' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'cancel') return null;
    if (action === 'manual') {
      console.log('\nVisit https://ollama.com/download and follow the installer for your OS.');
      continue;
    }
    const ok = runInteractiveCommand('brew', ['install', 'ollama']);
    if (!ok) return null;
    detection = detectOllama();
  }

  if (!detection.models.length) {
    const { modelAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'modelAction',
        message: 'No local models detected. Install a starter model?',
        choices: [
          { name: 'Install Meta Llama 3 (8B) – general purpose', value: 'llama3' },
          { name: 'Install Mistral Small (7B) – lighter option', value: 'mistral' },
          { name: 'Skip', value: 'skip' },
        ],
      },
    ]);
    if (modelAction === 'llama3') {
      const ok = runInteractiveCommand('ollama', ['pull', 'llama3']);
      if (!ok) return null;
    } else if (modelAction === 'mistral') {
      const ok = runInteractiveCommand('ollama', ['pull', 'mistral-small']);
      if (!ok) return null;
    }
    detection = detectOllama();
  }

  printOllamaModelSummary(detection.models);
  return detection;
}

async function fixWorkspaceDirectory(_ctx: SetupContext, _check: DoctorCheck): Promise<boolean> {
  const paths = getClonedPaths();
  if (!existsSync(paths.root)) {
    console.log('No .cloned/ directory detected. Run the "Initialize workspace" step first.');
    return false;
  }
  const { default: inquirer } = await import('inquirer');
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Fix permissions by running chmod 700 on ${paths.root}?`,
      default: true,
    },
  ]);
  if (!confirm) return false;
  try {
    chmodSync(paths.root, 0o700);
    console.log(`Permissions updated – ${paths.root} is now 700.`);
    return true;
  } catch (err) {
    console.error(`Failed to update permissions: ${(err as Error).message}`);
    return false;
  }
}

async function fixSqliteBindings(_ctx: SetupContext, _check: DoctorCheck): Promise<boolean> {
  const { default: inquirer } = await import('inquirer');
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'SQLite needs the better-sqlite3 native bindings. What should we do?',
      choices: [
        { name: 'Rebuild bindings now (npm rebuild better-sqlite3)', value: 'rebuild' },
        { name: 'Show manual instructions', value: 'instructions' },
        { name: 'Skip for now', value: 'skip' },
      ],
    },
  ]);
  if (action === 'skip') return false;
  if (action === 'instructions') {
    console.log(
      '\nManual fix:\n' +
        '  1. Ensure build tools are installed (Xcode CLI on macOS, build-essential on Linux).\n' +
        '  2. Run `npm rebuild better-sqlite3` (or `npm install --build-from-source better-sqlite3`).\n' +
        '  3. Re-run doctor.\n',
    );
    return false;
  }
  console.log('Running `npm rebuild better-sqlite3`...');
  return runInteractiveCommand('npm', ['rebuild', 'better-sqlite3']);
}

async function fixLlmApiKey(ctx: SetupContext, _check: DoctorCheck): Promise<boolean> {
  const workspace = ensureWorkspace(ctx);
  if (!workspace) {
    console.log('Workspace not initialized. Run the workspace step before setting secrets.');
    return false;
  }
  const llmConfig = await promptLlmProviderSelection(ctx);
  if (!llmConfig) return false;

  const provider = getVaultProvider({
    provider: workspace.config.vault_provider,
    filePath: resolveVaultPath(workspace.paths.root),
  });
  await provider.setSecret('llm.api_key', llmConfig.apiKey);
  if (llmConfig.apiBase) {
    await provider.setSecret('llm.api_base', llmConfig.apiBase);
    console.log(`Stored llm.api_base = ${llmConfig.apiBase}`);
  } else {
    try {
      await provider.deleteSecret('llm.api_base');
    } catch {
      /* no-op if secret missing */
    }
  }
  console.log(`Stored llm.api_key for ${llmConfig.label}.`);
  if (workspace.config.vault_provider === 'dev') {
    console.log('Reminder: the dev vault is in-memory only. Connect Azure Key Vault for persistence.');
  }
  return true;
}

async function fixGitleaks(_ctx: SetupContext, _check: DoctorCheck): Promise<boolean> {
  const { default: inquirer } = await import('inquirer');
  const choices = [
    {
      name: 'Install via Homebrew (brew install gitleaks)',
      value: 'brew',
      disabled: process.platform === 'darwin' ? undefined : 'macOS only',
    },
    { name: 'Install via Go (go install github.com/gitleaks/gitleaks/v8@latest)', value: 'go' },
    { name: 'Show manual download instructions', value: 'manual' },
    { name: 'Skip for now', value: 'skip' },
  ];
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'gitleaks provides local secret scanning. Pick an option to proceed.',
      choices,
    },
  ]);
  if (action === 'skip') return false;
  if (action === 'manual') {
    console.log(
      '\nManual install: download the latest release from https://github.com/gitleaks/gitleaks/releases,\n' +
        'then place the binary on your PATH (e.g., /usr/local/bin) and rerun doctor.\n',
    );
    return false;
  }
  if (action === 'brew') {
    return runInteractiveCommand('brew', ['install', 'gitleaks']);
  }
  if (action === 'go') {
    return runInteractiveCommand('go', ['install', 'github.com/gitleaks/gitleaks/v8@latest']);
  }
  return false;
}

function describeHardwareForLocalLlm(): void {
  const cores = os.cpus()?.length ?? 0;
  const memGb = os.totalmem() / 1024 ** 3;
  console.log(`Detected hardware: ${cores} cores, ${memGb.toFixed(1)} GB RAM.`);
  if (memGb < 16) {
    console.log('⚠ Local models may struggle with <16 GB RAM. Consider Docker + LocalAI or a hosted provider.');
  }
}

async function promptLlmProviderSelection(ctx: SetupContext): Promise<LlmProviderConfig | null> {
  const { default: inquirer } = await import('inquirer');
  const envKey = process.env['LLM_API_KEY'] ?? process.env['OPENAI_API_KEY'];
  const envBase = process.env['LLM_API_BASE'];
  const localAiAvailable = ctx.installMode === 'docker' ? detectLocalAiContainer() : false;
  const ollamaStatus = detectOllama();

  const choices = [
    envKey
      ? {
          name: 'Use the key from environment variables',
          value: 'env',
        }
      : null,
    { name: 'OpenAI (api.openai.com)', value: 'openai' },
    { name: 'Azure OpenAI (resource + deployment)', value: 'azure' },
    {
      name: `LocalAI (Docker-managed) ${localAiAvailable ? '– container detected' : '– start via "Launch Docker stack"'}`,
      value: 'localai',
      disabled: ctx.installMode === 'docker' ? undefined : 'Switch setup to Docker mode for this option',
    },
    {
      name: `Ollama (local runtime) ${ollamaStatus.installed ? `– ${ollamaStatus.version}` : ''}`,
      value: 'ollama',
    },
    { name: 'Custom OpenAI-compatible endpoint', value: 'custom' },
    { name: 'Back', value: 'back' },
  ].filter(Boolean) as Array<{ name: string; value: string; disabled?: string }>;

  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Which LLM provider would you like to use?',
      choices,
    },
  ]);

  if (provider === 'back') return null;
  if (provider === 'env' && envKey) {
    return { id: 'env', label: 'environment', apiKey: envKey, apiBase: envBase ?? undefined };
  }
  if (provider === 'openai') {
    const key = await promptForApiKey('Enter your OpenAI API key');
    if (!key) return null;
    return { id: 'openai', label: 'OpenAI', apiKey: key, apiBase: 'https://api.openai.com/v1' };
  }
  if (provider === 'azure') {
    return promptAzureOpenAiConfig();
  }
  if (provider === 'localai') {
    describeHardwareForLocalLlm();
    console.log(
      'LocalAI listens on http://127.0.0.1:8080/v1 once the docker stack is up. ' +
        'Use the "Launch Docker stack" step if it is not already running.',
    );
    return {
      id: 'localai',
      label: 'LocalAI (Docker)',
      apiKey: 'local-dev',
      apiBase: 'http://127.0.0.1:8080/v1',
    };
  }
  if (provider === 'ollama') {
    describeHardwareForLocalLlm();
    const detection = await ensureOllamaReady();
    if (!detection) return null;
    return {
      id: 'ollama',
      label: 'Ollama',
      apiKey: 'ollama-local',
      apiBase: 'http://127.0.0.1:11434/v1',
    };
  }
  if (provider === 'custom') {
    return promptCustomLlmConfig();
  }
  return null;
}

async function promptForApiKey(message: string): Promise<string | null> {
  return promptTextWithBack({
    message,
    type: 'password',
    mask: '*',
    required: true,
  });
}

async function promptAzureOpenAiConfig(): Promise<LlmProviderConfig | null> {
  const endpoint = await promptTextWithBack({
    message: 'Azure OpenAI endpoint (resource name or https URL)',
    required: true,
  });
  if (endpoint === null) return null;

  const deployment = await promptTextWithBack({
    message: 'Deployment name (model slot)',
    required: true,
  });
  if (deployment === null) return null;

  const apiVersion = await promptTextWithBack({
    message: 'API version (e.g., 2024-02-15-preview)',
    defaultValue: '2024-02-15-preview',
    required: true,
  });
  if (apiVersion === null) return null;

  const key = await promptForApiKey('Enter your Azure OpenAI API key');
  if (!key) return null;

  const normalizedEndpoint = endpoint.startsWith('http')
    ? endpoint.replace(/\/$/, '')
    : `https://${endpoint}.openai.azure.com`;
  const pathBase = `${normalizedEndpoint.replace(/\/$/, '')}/openai/deployments/${deployment}`;
  const apiBase = `${pathBase}?api-version=${apiVersion}`;

  return {
    id: 'azure',
    label: 'Azure OpenAI',
    apiKey: key,
    apiBase,
  };
}

async function promptCustomLlmConfig(): Promise<LlmProviderConfig | null> {
  const label = await promptTextWithBack({
    message: 'Provider label (e.g., Groq, Together, LM Studio)',
    defaultValue: 'Custom provider',
    required: false,
  });
  if (label === null) return null;
  const base = await promptTextWithBack({
    message: 'Base URL (must include protocol, e.g., https://api.groq.com/openai/v1)',
    required: true,
    validate: (value: string) => {
      try {
        // eslint-disable-next-line no-new
        new URL(value);
        return true;
      } catch {
        return 'Enter a valid URL (https://...)';
      }
    },
  });
  if (base === null) return null;
  const key = await promptForApiKey('Enter the API key/token for this provider');
  if (!key) return null;
  return {
    id: 'custom',
    label: label.trim() || 'Custom provider',
    apiKey: key,
    apiBase: base,
  };
}

async function runDoctorStep(ctx: SetupContext): Promise<boolean> {
  console.log('Running doctor checks...');
  const report = await runDoctorChecks();
  await promptDoctorLoop(ctx, report);
  return true;
}

async function runAzureStep(ctx: SetupContext): Promise<boolean> {
  const workspace = ensureWorkspace(ctx);
  if (!workspace) {
    console.log('Workspace not initialized. Run "Initialize workspace" first.');
    return false;
  }
  await runAzureBootstrapWizard({ workspace, interactive: true, verify: true });
  ctx.workspace = tryLoadWorkspace();
  return true;
}

interface ComposeCommand {
  cmd: string;
  args: string[];
}

function resolveComposeFilePath(): string | null {
  const override = process.env['CLONED_DOCKER_COMPOSE'];
  const candidates = [
    override,
    join(process.cwd(), 'docker', 'compose.local-llm.yaml'),
    join(process.cwd(), 'compose.local-llm.yaml'),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function detectDockerComposeCommand(): ComposeCommand | null {
  const attempts: ComposeCommand[] = [
    { cmd: 'docker', args: ['compose'] },
    { cmd: 'docker-compose', args: [] },
  ];
  for (const attempt of attempts) {
    const result = spawnSync(attempt.cmd, [...attempt.args, '--version'], { stdio: 'ignore' });
    if (!result.error && result.status === 0) {
      return attempt;
    }
  }
  return null;
}

function runDockerComposeCommand(
  compose: ComposeCommand,
  composeFile: string,
  extraArgs: string[],
): boolean {
  return runInteractiveCommand(compose.cmd, [...compose.args, '-f', composeFile, ...extraArgs]);
}

function printDockerEnvHints(): void {
  console.log('\nLocalAI listens on http://127.0.0.1:8080. Configure Cloned with:');
  console.log('  export LLM_API_BASE=http://localhost:8080/v1');
  console.log('  export LLM_API_KEY=local-dev  # or `cloned vault set llm.api_key local-dev`');
}

async function runDockerStackStep(ctx: SetupContext): Promise<boolean> {
  if (ctx.installMode !== 'docker') {
    console.log('Docker stack step only applies to Docker installs.');
    return true;
  }
  const composeFile = resolveComposeFilePath();
  if (!composeFile) {
    console.log(
      'Could not locate docker/compose.local-llm.yaml. Run setup from the repo root or set CLONED_DOCKER_COMPOSE=/path/to/compose.',
    );
    return false;
  }
  const composeCmd = detectDockerComposeCommand();
  if (!composeCmd) {
    console.log(
      'Docker Compose CLI not found. Install Docker Desktop (or the docker compose plugin) and re-run this step.',
    );
    return false;
  }

  console.log(
    '\nThis step launches the hardened LocalAI container (non-root, read-only, loopback) so Docker installs have a local LLM endpoint.',
  );
  const { default: inquirer } = await import('inquirer');
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Docker actions',
      choices: [
        { name: 'Bring up LocalAI now (docker compose up -d)', value: 'up' },
        { name: 'Tear down LocalAI (docker compose down)', value: 'down' },
        { name: 'Show container status (docker ps --filter name=cloned-localai)', value: 'status' },
        { name: 'Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') return false;
  if (action === 'status') {
    runInteractiveCommand('docker', ['ps', '--filter', 'name=cloned-localai']);
    return false;
  }
  if (action === 'up') {
    const ok = runDockerComposeCommand(composeCmd, composeFile, ['up', '-d']);
    if (ok) {
      console.log('Docker stack is running.');
      printDockerEnvHints();
    }
    return ok;
  }
  if (action === 'down') {
    const ok = runDockerComposeCommand(composeCmd, composeFile, ['down']);
    if (ok) console.log('Docker stack stopped.');
    return ok;
  }
  return false;
}

function getSetupSteps(mode: InstallMode): SetupStep[] {
  const steps: SetupStep[] = [
    {
      id: 'workspace',
      title: 'Initialize workspace (.cloned/)',
      description: 'Create or reset the local workspace structure.',
      run: runWorkspaceInit,
    },
    {
      id: 'doctor',
      title: 'Run doctor checks',
      description: 'Verify environment health and prerequisites.',
      run: runDoctorStep,
    },
    {
      id: 'azure',
      title: 'Connect Azure Key Vault',
      description: 'Guided wizard to configure the Azure vault provider.',
      run: runAzureStep,
    },
  ];
  if (mode === 'docker') {
    steps.splice(1, 0, {
      id: 'docker',
      title: 'Launch Docker stack',
      description: 'Start the hardened LocalAI container via docker compose.',
      run: runDockerStackStep,
    });
  }
  return steps;
}

function printSetupSummary(
  steps: SetupStep[],
  status: Map<string, 'pending' | 'done' | 'skipped'>,
): void {
  console.log('\nSetup status:');
  for (const step of steps) {
    const st = status.get(step.id) ?? 'pending';
    const icon = st === 'done' ? '✓' : st === 'skipped' ? '↷' : '…';
    console.log(`  ${icon} ${step.title}: ${st}`);
  }
  console.log('\nRe-run `cloned setup` anytime to pick up where you left off.');
}

function describeInstallModes(): void {
  console.log(
    '\nInstall modes:\n' +
      '  • Docker (recommended) – runs Cloned + dependencies in isolated containers.\n' +
      '    Great for production/hardened setups. Requires Docker Desktop.\n' +
      '  • Local workstation – runs the CLI/API directly on your machine.\n' +
      '    Faster for development, but you are responsible for isolation.\n',
  );
}

async function promptInstallMode(): Promise<InstallMode> {
  const { default: inquirer } = await import('inquirer');
  while (true) {
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'How would you like to run Cloned? (Docker recommended)',
        default: 'docker',
        choices: [
          { name: 'Docker (recommended)', value: 'docker' },
          { name: 'Local workstation', value: 'local' },
          { name: 'Explain the options', value: '__explain' },
        ],
      },
    ]);
    if (mode === '__explain') {
      describeInstallModes();
      continue;
    }
    return mode as InstallMode;
  }
}

interface Requirement {
  label: string;
  detected: string;
  status: 'pass' | 'warn' | 'fail';
  required: boolean;
  recommendation?: string;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return `${gb.toFixed(1)} GB`;
}

function checkCommandVersion(cmd: string): string | null {
  try {
    const out = execSync(`${cmd} --version`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out;
  } catch {
    return null;
  }
}

async function runPrereqGate(mode: InstallMode): Promise<boolean> {
  const requirements: Requirement[] = [];
  const nodeVersion = process.version;
  requirements.push({
    label: 'Node.js >= 20',
    detected: nodeVersion,
    status: 'pass',
    required: true,
  });

  const npmVersion = checkCommandVersion('npm');
  if (npmVersion) {
    requirements.push({
      label: 'npm >= 9',
      detected: npmVersion,
      status: npmVersion.localeCompare('9', undefined, { numeric: true }) >= 0 ? 'pass' : 'fail',
      required: true,
      recommendation: npmVersion.localeCompare('9', undefined, { numeric: true }) >= 0 ? undefined : 'Upgrade npm via Node installer',
    });
  } else {
    requirements.push({
      label: 'npm >= 9',
      detected: 'not found',
      status: 'fail',
      required: true,
      recommendation: 'Install npm (bundled with Node.js installer).',
    });
  }

  const dockerVersion = checkCommandVersion('docker');
  const dockerRequired = mode === 'docker';
  requirements.push({
    label: 'Docker CLI',
    detected: dockerVersion ?? 'not found',
    status: dockerVersion ? 'pass' : dockerRequired ? 'fail' : 'warn',
    required: dockerRequired,
    recommendation: dockerVersion
      ? undefined
      : 'Install Docker Desktop: https://docs.docker.com/desktop/',
  });

  const cpus = os.cpus();
  const coreCount = cpus?.length ?? 0;
  requirements.push({
    label: 'CPU cores',
    detected: coreCount ? `${coreCount} (${cpus[0]?.model ?? 'unknown'})` : 'unknown',
    status: coreCount >= 4 ? 'pass' : 'warn',
    required: false,
    recommendation: coreCount >= 4 ? undefined : 'Recommend ≥4 cores for smoother pipelines.',
  });

  const totalMem = os.totalmem();
  requirements.push({
    label: 'RAM',
    detected: formatBytes(totalMem),
    status: totalMem >= 8 * 1024 ** 3 ? 'pass' : 'warn',
    required: false,
    recommendation: totalMem >= 8 * 1024 ** 3 ? undefined : 'Recommend ≥16 GB for Dockerized installs.',
  });

  console.log('\nSystem check:');
  for (const req of requirements) {
    const icon = req.status === 'pass' ? '✓' : req.status === 'warn' ? '⚠' : '✗';
    const label = req.required ? `${req.label} (required)` : req.label;
    console.log(`  ${icon} ${label}: ${req.detected}`);
    if (req.recommendation) console.log(`     ${req.recommendation}`);
  }

  const failedRequired = requirements.some((req) => req.required && req.status === 'fail');
  if (failedRequired) {
    console.log('\nResolve the required items above before continuing.');
    return false;
  }
  return true;
}

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Interactive onboarding wizard (workspace, doctor, Azure vault)')
    .action(async () => {
      const { default: inquirer } = await import('inquirer');
      const installMode = await promptInstallMode();
      const initialPaths = getClonedPaths();
      const workspaceExists = existsSync(initialPaths.root);
      const ctx: SetupContext = { workspace: workspaceExists ? tryLoadWorkspace() : null, installMode };
      const steps = getSetupSteps(installMode);
      const runningInContainer =
        installMode === 'docker' ||
        process.env['CLONED_IN_CONTAINER'] === '1' ||
        process.env['container']?.toLowerCase() === 'docker';
      if (!runningInContainer && process.env['CLONED_SKIP_DOCKER_WARNING'] !== '1') {
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message:
              'You are about to run setup outside a container. Hardened deployments should run inside Docker. Continue?',
            default: false,
          },
        ]);
        if (!proceed) {
          console.log('Setup aborted. See docs/runtime/containers.md for container instructions.');
          return;
        }
      }

      const prereqOk = await runPrereqGate(installMode);
      if (!prereqOk) return;

      const status = new Map<string, 'pending' | 'done' | 'skipped'>();
      steps.forEach((step) => status.set(step.id, 'pending'));
      if (workspaceExists) {
        status.set('workspace', 'done');
      }

      let stepInProgress = false;
      let pendingSigintExit = false;
      let shuttingDown = false;

      const exitGracefully = (code = 130, reason?: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        if (reason) console.log(reason);
        printSetupSummary(steps, status);
        process.exit(code);
      };

      const handleSigint = (): void => {
        if (shuttingDown) return;
        console.log('\nReceived Ctrl+C – preparing to exit setup.');
        if (stepInProgress) {
          pendingSigintExit = true;
          console.log('Waiting for the current step to finish so your workspace stays consistent...');
        } else {
          exitGracefully(130, '\nExiting setup. Progress saved.');
        }
      };

      process.on('SIGINT', handleSigint);

      try {
        let exit = false;
        while (!exit) {
          const choices = steps.map((step) => {
            const st = status.get(step.id) ?? 'pending';
            const icon = st === 'done' ? '✓' : st === 'skipped' ? '↷' : '…';
            return {
              name: `${icon} ${step.title} – ${step.description}`,
              value: step.id,
            };
          });
          choices.push({ name: 'Exit setup', value: 'exit' });

          const { selection } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selection',
              message: 'Select a step to run/mark:',
              choices,
            },
          ]);

          if (selection === 'exit') {
            exit = true;
            break;
          }

          const current = steps.find((s) => s.id === selection);
          if (!current) continue;

          const { action } = await inquirer.prompt([
            {
              type: 'list',
              name: 'action',
              message: `${current.title} – choose an action`,
              choices: [
                { name: 'Run now', value: 'run' },
                { name: 'Skip / mark as later', value: 'skip' },
                { name: 'Mark as pending', value: 'reset' },
                { name: 'Back', value: 'back' },
              ],
            },
          ]);

          if (action === 'run') {
            stepInProgress = true;
            try {
              const success = await current.run(ctx);
              status.set(current.id, success ? 'done' : 'pending');
            } catch (err) {
              console.error(`Step failed: ${(err as Error).message}`);
              status.set(current.id, 'pending');
            } finally {
              stepInProgress = false;
              if (pendingSigintExit) {
                exitGracefully(130, '\nExiting setup after completing the in-flight step.');
              }
            }
          } else if (action === 'skip') {
            status.set(current.id, 'skipped');
          } else if (action === 'reset') {
            status.set(current.id, 'pending');
          }
        }
      } finally {
        process.off('SIGINT', handleSigint);
        if (!shuttingDown) {
          printSetupSummary(steps, status);
        }
      }
    });
}
