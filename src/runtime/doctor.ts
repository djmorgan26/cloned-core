import { existsSync, readFileSync } from 'node:fs';
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

function getNodeVersion(): string | null {
  try {
    const v = process.version; // e.g. "v20.11.0"
    return v.replace(/^v/, '');
  } catch {
    return null;
  }
}

export function runDoctorChecks(cwd?: string): DoctorReport {
  const paths = getClonedPaths(cwd);
  const checks: DoctorCheck[] = [];

  // --- Environment checks ---
  checks.push(
    check('Node.js >= 20', () => {
      const v = getNodeVersion();
      if (!v) return { status: 'fail', message: 'Could not determine Node.js version' };
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

  // --- Workspace checks ---
  checks.push(
    check('Workspace initialized (.cloned/)', () => {
      if (existsSync(paths.root))
        return { status: 'pass', message: `.cloned/ found at ${paths.root}` };
      return {
        status: 'fail',
        message: 'Workspace not initialized',
        fix: 'Run: cloned init',
      };
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
      if (existsSync(paths.stateDb))
        return { status: 'pass', message: 'state.db present' };
      return { status: 'fail', message: 'state.db missing', fix: 'Run: cloned init' };
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

  // --- Security checks ---
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
      const isLoopback =
        host === '127.0.0.1' || host === 'localhost' || host === '::1';
      if (isLoopback) return { status: 'pass', message: `API binds to ${host} (loopback)` };
      return {
        status: 'warn',
        message: `API configured to bind to ${host} (non-loopback). Ensure auth is configured.`,
        fix: 'Set CLONED_API_HOST=127.0.0.1 or configure auth middleware',
      };
    }),
  );

  // --- Connector checks ---
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

  // Determine overall status
  const hasFailure = checks.some((c) => c.status === 'fail');
  const hasWarning = checks.some((c) => c.status === 'warn');
  const overall: CheckStatus = hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass';

  const passCount = checks.filter((c) => c.status === 'pass').length;
  const summary = `${passCount}/${checks.length} checks passed${hasFailure ? ' – FAILURES detected' : ''}${hasWarning && !hasFailure ? ' – warnings present' : ''}`;

  return { overall, checks, summary };
}
