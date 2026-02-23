#!/usr/bin/env node
import { Command } from 'commander';
import { loadWorkspaceEnv } from '../workspace/env.js';
import { registerInitCommand } from './commands/init.js';
import { registerOnboardCommand } from './commands/onboard.js';
import { registerConnectCommand } from './commands/connect.js';
import { registerRunCommand } from './commands/run.js';
import { registerApprovalsCommand } from './commands/approvals.js';
import { registerVaultCommand } from './commands/vault.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerServeCommand } from './commands/serve.js';
import { registerFirewallCommand } from './commands/firewall.js';
import { registerSetupCommand } from './commands/setup.js';

loadWorkspaceEnv();

const program = new Command();

program
  .name('cloned')
  .description('Cloned – local-first agent operating system')
  .version('0.1.0');

registerInitCommand(program);
registerOnboardCommand(program);
registerConnectCommand(program);
registerRunCommand(program);
registerApprovalsCommand(program);
registerVaultCommand(program);
registerDoctorCommand(program);
registerServeCommand(program);
registerFirewallCommand(program);
registerSetupCommand(program);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error('Error:', err.message);
  process.exit(1);
});
