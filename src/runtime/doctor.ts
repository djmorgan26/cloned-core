import { existsSync, readFileSync, statSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { load } from 'js-yaml';
import { getClonedPaths } from '../workspace/paths.js';
import { readWorkspaceConfig } from '../workspace/config.js';
import { getVaultProvider } from '../vault/index.js';
import { loadWorkspaceEnv } from '../workspace/env.js';

const _require = createRequire(import.meta.url);

export type CheckStatus = 'pass' | 'fail' | 'warn';

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

export interface DoctorReport {
  overall: CheckStatus;
  checks: DoctorCheck[];
  summary: string;
}

async function check(
  name: string,
  fn: () => Promise<{ status: CheckStatus; message: string; fix?: string }> | {
    status: CheckStatus;
    message: string;
    fix?: string;
  },
): Promise<DoctorCheck> {
  try {
    const result = await Promise.resolve(fn());
    return { name, ...result };
  } catch (err) {
    return {
      name,
      status: 'fail',
      message: `Check threw: ${(err as Error).message}`,
    };
  }
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface OllamaDetection {
  installed: boolean;
  version?: string;
  models: string[];
}

function detectOllamaCli(): OllamaDetection {
  try {
    const versionResult = spawnSync('ollama', ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    if (versionResult.error || versionResult.status !== 0) {
      return { installed: false, models: [] };
    }
    const listResult = spawnSync('ollama', ['list'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    let models: string[] = [];
    if (!listResult.error && listResult.status === 0) {
      models = parseOllamaList(listResult.stdout || '');
    }
    return { installed: true, version: versionResult.stdout.trim(), models };
  } catch {
    return { installed: false, models: [] };
  }
}

function parseOllamaList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(name|model)\b/i.test(line))
    .map((line) => (line.split(/\s+/)[0] ?? '').trim())
    .filter((name) => name.length > 0);
}

function detectLocalAiContainer(): boolean {
  try {
    const result = spawnSync('docker', ['ps', '--filter', 'name=cloned-localai', '--format', '{{.ID}}'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    if (result.error || result.status !== 0) return false;
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function describeLocalLlmOptions(): string | null {
  const hints: string[] = [];
  const ollama = detectOllamaCli();
  if (ollama.installed) {
    const modelList = ollama.models.slice(0, 3).join(', ');
    const suffix = ollama.models.length > 3 ? ', …' : '';
    const detail = modelList ? `models: ${modelList}${suffix}` : 'no models pulled yet';
    hints.push(`Ollama ${ollama.version ?? ''} (${detail})`);
  }
  if (detectLocalAiContainer()) {
    hints.push('LocalAI Docker stack detected (container name matches cloned-localai)');
  }
  return hints.length ? hints.join('; ') : null;
}

export async function runDoctorChecks(cwd?: string): Promise<DoctorReport> {
  loadWorkspaceEnv(cwd ?? process.cwd());
  const paths = getClonedPaths(cwd);
  let config: ReturnType<typeof readWorkspaceConfig> | null = null;
  try {
    config = readWorkspaceConfig(paths.config);
  } catch {
    config = null;
  }
  const checks: DoctorCheck[] = [];

  // ── Environment ──────────────────────────────────────────────────────────
  checks.push(
    await check('Node.js >= 20', () => {
      const v = process.version.replace(/^v/, '');
      const major = parseInt(v.split('.')[0] ?? '0', 10);
      if (major >= 20) return { status: 'pass', message: `Node.js ${v}` };
      return {
        status: 'fail',
        message: `Node.js ${v} is below required v20`,
        fix: 'Upgrade Node.js to v20 or later: https://nodejs.org',
      };
    }),
  );

  checks.push(
    await check('npm available', () => {
      if (commandExists('npm')) return { status: 'pass', message: 'npm found' };
      return { status: 'fail', message: 'npm not found', fix: 'Install npm via Node.js installer' };
    }),
  );

  // ── Workspace ─────────────────────────────────────────────────────────────
  checks.push(
    await check('Workspace initialized (.cloned/)', () => {
      if (!existsSync(paths.root)) {
        return { status: 'fail', message: 'Workspace not initialized', fix: 'Run: cloned init' };
      }
      try {
        const mode = statSync(paths.root).mode & 0o777;
        if (mode !== 0o700) {
          return {
            status: 'warn',
            message: `.cloned/ permissions are ${mode.toString(8)} (expected 700)`,
            fix: `Run: chmod 700 "${paths.root}"`,
          };
        }
      } catch {
        // Stat failed – still pass the existence check
      }
      return { status: 'pass', message: `.cloned/ found at ${paths.root}` };
    }),
  );

  checks.push(
    await check('Config file present', () => {
      if (existsSync(paths.config))
        return { status: 'pass', message: 'config.yaml present' };
      return { status: 'fail', message: 'config.yaml missing', fix: 'Run: cloned init' };
    }),
  );

  checks.push(
    await check('State DB present', () => {
      if (!existsSync(paths.stateDb)) {
        return { status: 'fail', message: 'state.db missing', fix: 'Run: cloned init' };
      }
      return { status: 'pass', message: 'state.db present' };
    }),
  );

  // ── SQLite WAL mode ───────────────────────────────────────────────────────
  checks.push(
    await check('SQLite WAL mode enabled', () => {
      if (!existsSync(paths.stateDb)) {
        return { status: 'warn', message: 'state.db not found – skipping WAL check' };
      }
      try {
        const BetterSQLite3 = _require('better-sqlite3') as new(path: string, opts?: { readonly?: boolean }) => { prepare: (sql: string) => { get: () => unknown }; close: () => void };
        const db = new BetterSQLite3(paths.stateDb, { readonly: true });
        const row = db.prepare(`PRAGMA journal_mode`).get() as { journal_mode: string } | undefined;
        db.close();
        if (row?.journal_mode === 'wal') {
          return { status: 'pass', message: 'SQLite WAL mode active (crash-safe)' };
        }
        return {
          status: 'warn',
          message: `SQLite journal_mode=${row?.journal_mode ?? 'unknown'} (expected wal)`,
          fix: 'Reinitialize workspace: cloned init',
        };
      } catch (err) {
        return {
          status: 'warn',
          message: `Could not check WAL mode: ${(err as Error).message}`,
        };
      }
    }),
  );

  checks.push(
    await check('Registry present', () => {
      if (existsSync(paths.registry))
        return { status: 'pass', message: 'registry.yaml present' };
      return { status: 'fail', message: 'registry.yaml missing', fix: 'Run: cloned init' };
    }),
  );

  checks.push(
    await check('Audit log present', () => {
      if (existsSync(paths.auditLog))
        return { status: 'pass', message: 'audit.log present' };
      return {
        status: 'warn',
        message: 'audit.log not found (will be created on first action)',
      };
    }),
  );

  checks.push(
    await check('Trust store directory', () => {
      if (existsSync(paths.trustDir))
        return { status: 'pass', message: 'trust/ directory present' };
      return {
        status: 'warn',
        message: 'trust/ directory missing',
        fix: 'Run: cloned init (or mkdir .cloned/trust)',
      };
    }),
  );

  // ── Vault ─────────────────────────────────────────────────────────────────
  const vaultFile = `${paths.root}/vault.dev.json`;
  const vaultProviderName = config?.vault_provider ?? 'file';

  checks.push(
    await check('Vault provider reachable', async () => {
      if (!config) {
        return {
          status: 'fail',
          message: 'Workspace not initialized – cannot resolve vault provider',
          fix: 'Run: cloned init',
        };
      }

      if (vaultProviderName === 'file' && !existsSync(vaultFile)) {
        return {
          status: 'warn',
          message: `Dev vault file not found at ${vaultFile} (will be created on first secret write)`,
          fix: 'Run: cloned vault set <key> <value>',
        };
      }

      try {
        const vault = getVaultProvider({ provider: vaultProviderName, filePath: vaultFile });
        const status = await vault.status();
        if (status.healthy) {
          return {
            status: 'pass',
            message: status.message ?? `${status.provider} provider healthy`,
          };
        }
        return {
          status: 'warn',
          message: status.message ?? `${status.provider} provider reported unhealthy state`,
          fix: 'Run: cloned vault status',
        };
      } catch (err) {
        const fix =
          vaultProviderName === 'azure'
            ? 'Install @azure/keyvault-secrets @azure/identity and export AZURE_* vars'
            : 'Re-run: cloned init (or switch back via `cloned vault provider file`)';
        return {
          status: 'fail',
          message: `Failed to load ${vaultProviderName} provider: ${(err as Error).message}`,
          fix,
        };
      }
    }),
  );

  checks.push(
    await check('LLM API key configured', async () => {
      const envKey = process.env['LLM_API_KEY'] ?? process.env['OPENAI_API_KEY'];
      if (envKey) {
        return { status: 'pass', message: 'LLM API key found in environment' };
      }
      if (!config) {
        return {
          status: 'warn',
          message: 'Workspace not initialized; cannot read vault for llm.api_key',
          fix: 'Run: cloned init',
        };
      }
      try {
        const vault = getVaultProvider({ provider: vaultProviderName, filePath: vaultFile });
        const secret = await vault.getSecret('llm.api_key');
        if (secret) {
          return { status: 'pass', message: 'LLM API key found in vault' };
        }
      } catch (err) {
        return {
          status: 'warn',
          message: `Unable to read vault: ${(err as Error).message}`,
          fix: 'Run: cloned vault status',
        };
      }
      const localHints = describeLocalLlmOptions();
      const hintSuffix = localHints
        ? ` Detected local runtimes: ${localHints}. Run the doctor fixer to connect automatically or set a key manually.`
        : '';
      return {
        status: 'warn',
        message: `LLM API key not configured (required for synthesis).${hintSuffix}`,
        fix: 'Run: cloned vault set llm.api_key <your-key>  or set LLM_API_KEY env var',
      };
    }),
  );

  // ── Security ──────────────────────────────────────────────────────────────
  checks.push(
    await check('gitleaks available', () => {
      if (commandExists('gitleaks'))
        return { status: 'pass', message: 'gitleaks found' };
      return {
        status: 'warn',
        message: 'gitleaks not found – secret scanning disabled locally',
        fix: 'Install gitleaks: https://github.com/gitleaks/gitleaks',
      };
    }),
  );

  checks.push(
    await check('API bind is loopback', () => {
      const host = process.env['CLONED_API_HOST'] ?? '127.0.0.1';
      const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
      if (isLoopback) return { status: 'pass', message: `API binds to ${host} (loopback)` };
      return {
        status: 'warn',
        message: `API configured to bind to ${host} (non-loopback). Ensure auth is configured.`,
        fix: 'Set CLONED_API_HOST=127.0.0.1 or configure auth middleware',
      };
    }),
  );

  // ── Connector registry ───────────────────────────────────────────────────
  checks.push(
    await check('Registry parses cleanly', () => {
      if (!existsSync(paths.registry)) {
        return { status: 'warn', message: 'Registry not found – skipping parse check' };
      }
      try {
        load(readFileSync(paths.registry, 'utf8'));
        return { status: 'pass', message: 'Registry parsed OK' };
      } catch (err) {
        return {
          status: 'fail',
          message: `Registry parse error: ${(err as Error).message}`,
          fix: 'Check .cloned/registry.yaml for syntax errors',
        };
      }
    }),
  );

  // Determine overall
  const hasFailure = checks.some((c) => c.status === 'fail');
  const hasWarning = checks.some((c) => c.status === 'warn');
  const overall: CheckStatus = hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass';

  const passCount = checks.filter((c) => c.status === 'pass').length;
  const summary =
    `${passCount}/${checks.length} checks passed` +
    (hasFailure ? ' – FAILURES detected' : '') +
    (hasWarning && !hasFailure ? ' – warnings present' : '');

  return { overall, checks, summary };
}
