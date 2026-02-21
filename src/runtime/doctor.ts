import { existsSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { load } from 'js-yaml';
import { getClonedPaths } from '../workspace/paths.js';

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

function check(
  name: string,
  fn: () => { status: CheckStatus; message: string; fix?: string },
): DoctorCheck {
  try {
    const result = fn();
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

export function runDoctorChecks(cwd?: string): DoctorReport {
  const paths = getClonedPaths(cwd);
  const checks: DoctorCheck[] = [];

  // ── Environment ──────────────────────────────────────────────────────────
  checks.push(
    check('Node.js >= 20', () => {
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
    check('npm available', () => {
      if (commandExists('npm')) return { status: 'pass', message: 'npm found' };
      return { status: 'fail', message: 'npm not found', fix: 'Install npm via Node.js installer' };
    }),
  );

  // ── Workspace ─────────────────────────────────────────────────────────────
  checks.push(
    check('Workspace initialized (.cloned/)', () => {
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
    check('Config file present', () => {
      if (existsSync(paths.config))
        return { status: 'pass', message: 'config.yaml present' };
      return { status: 'fail', message: 'config.yaml missing', fix: 'Run: cloned init' };
    }),
  );

  checks.push(
    check('State DB present', () => {
      if (!existsSync(paths.stateDb)) {
        return { status: 'fail', message: 'state.db missing', fix: 'Run: cloned init' };
      }
      return { status: 'pass', message: 'state.db present' };
    }),
  );

  // ── SQLite WAL mode ───────────────────────────────────────────────────────
  checks.push(
    check('SQLite WAL mode enabled', () => {
      if (!existsSync(paths.stateDb)) {
        return { status: 'warn', message: 'state.db not found – skipping WAL check' };
      }
      try {
        // Dynamically require better-sqlite3 (sync require avoids ESM async restrictions)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const BetterSQLite3 = require('better-sqlite3') as { new(path: string, opts?: { readonly?: boolean }): { prepare: (sql: string) => { get: () => unknown }; close: () => void } };
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
    check('Registry present', () => {
      if (existsSync(paths.registry))
        return { status: 'pass', message: 'registry.yaml present' };
      return { status: 'fail', message: 'registry.yaml missing', fix: 'Run: cloned init' };
    }),
  );

  checks.push(
    check('Audit log present', () => {
      if (existsSync(paths.auditLog))
        return { status: 'pass', message: 'audit.log present' };
      return {
        status: 'warn',
        message: 'audit.log not found (will be created on first action)',
      };
    }),
  );

  checks.push(
    check('Trust store directory', () => {
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
  checks.push(
    check('Vault reachable', () => {
      const vaultFile = `${paths.root}/vault.dev.json`;
      if (existsSync(vaultFile)) {
        return { status: 'pass', message: `Dev vault present at ${vaultFile}` };
      }
      return {
        status: 'warn',
        message: 'Dev vault file not found (will be created on first secret write)',
        fix: 'Run: cloned vault set <key> <value>',
      };
    }),
  );

  checks.push(
    check('LLM API key configured', () => {
      const envKey = process.env['LLM_API_KEY'] ?? process.env['OPENAI_API_KEY'];
      if (envKey) {
        return { status: 'pass', message: 'LLM API key found in environment' };
      }
      const vaultFile = `${paths.root}/vault.dev.json`;
      if (existsSync(vaultFile)) {
        try {
          const store = JSON.parse(readFileSync(vaultFile, 'utf8')) as {
            secrets?: Record<string, unknown>;
          };
          if (store.secrets?.['llm.api_key']) {
            return { status: 'pass', message: 'LLM API key found in vault' };
          }
        } catch {
          // Ignore parse error
        }
      }
      return {
        status: 'warn',
        message: 'LLM API key not configured (required for synthesis)',
        fix: 'Run: cloned vault set llm.api_key <your-key>  or set LLM_API_KEY env var',
      };
    }),
  );

  // ── Security ──────────────────────────────────────────────────────────────
  checks.push(
    check('gitleaks available', () => {
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
    check('API bind is loopback', () => {
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
    check('Registry parses cleanly', () => {
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
