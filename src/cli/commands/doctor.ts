import type { Command } from 'commander';
import { runDoctorChecks } from '../../runtime/doctor.js';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check environment health and diagnose issues')
    .action(() => {
      console.log('Running Cloned environment checks...\n');

      const report = runDoctorChecks();

      for (const check of report.checks) {
        const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
        const color =
          check.status === 'pass' ? '\x1b[32m' : check.status === 'warn' ? '\x1b[33m' : '\x1b[31m';
        const reset = '\x1b[0m';

        console.log(`${color}${icon} ${check.name}${reset}`);
        console.log(`  ${check.message}`);
        if (check.fix) console.log(`  Fix: ${check.fix}`);
        console.log();
      }

      const overallColor =
        report.overall === 'pass'
          ? '\x1b[32m'
          : report.overall === 'warn'
            ? '\x1b[33m'
            : '\x1b[31m';
      const reset = '\x1b[0m';
      console.log(`${overallColor}Overall: ${report.overall.toUpperCase()} – ${report.summary}${reset}`);

      if (report.overall === 'fail') process.exit(1);
    });
}
