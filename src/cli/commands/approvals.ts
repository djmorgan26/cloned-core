import type { Command } from 'commander';
import { getClonedPaths } from '../../workspace/paths.js';
import { readWorkspaceConfig } from '../../workspace/config.js';
import { openDb } from '../../workspace/db.js';
import { listApprovals, decideApproval } from '../../governance/approvals.js';

export function registerApprovalsCommand(program: Command): void {
  const approvals = program
    .command('approvals')
    .description('Manage approval requests');

  approvals
    .command('list')
    .description('List approval requests')
    .option('--status <status>', 'Filter by status: pending, approved, denied')
    .action((opts) => {
      const paths = getClonedPaths();
      let config;
      try {
        config = readWorkspaceConfig(paths.config);
      } catch {
        console.error('Workspace not initialized. Run: cloned init');
        process.exit(1);
      }

      const db = openDb(paths.stateDb);
      const filter = opts.status ? { status: opts.status as 'pending' | 'approved' | 'denied' } : undefined;
      const items = listApprovals(db, config.workspace_id, filter);

      if (items.length === 0) {
        console.log('No approvals found.');
        return;
      }

      console.log(`\nApprovals (${items.length}):\n`);
      for (const a of items) {
        const status = a.status.toUpperCase().padEnd(8);
        console.log(`  [${status}] ${a.id}`);
        console.log(`          Scope:   ${a.scope}`);
        console.log(`          Created: ${a.created_at}`);
        if (a.actor) console.log(`          Actor:   ${a.actor}`);
        if (a.decided_at) console.log(`          Decided: ${a.decided_at}`);
        if (a.decision_reason) console.log(`          Reason:  ${a.decision_reason}`);
        console.log();
      }
    });

  approvals
    .command('approve <id>')
    .description('Approve a pending request')
    .option('--reason <reason>', 'Reason for decision')
    .action((id: string, opts) => {
      const paths = getClonedPaths();
      let config;
      try {
        config = readWorkspaceConfig(paths.config);
      } catch {
        console.error('Workspace not initialized. Run: cloned init');
        process.exit(1);
      }

      const db = openDb(paths.stateDb);
      try {
        const updated = decideApproval(db, config.workspace_id, id, 'approved', opts.reason);
        console.log(`Approved: ${updated.id}`);
      } catch (err) {
        console.error(`Failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  approvals
    .command('deny <id>')
    .description('Deny a pending request')
    .option('--reason <reason>', 'Reason for decision')
    .action((id: string, opts) => {
      const paths = getClonedPaths();
      let config;
      try {
        config = readWorkspaceConfig(paths.config);
      } catch {
        console.error('Workspace not initialized. Run: cloned init');
        process.exit(1);
      }

      const db = openDb(paths.stateDb);
      try {
        const updated = decideApproval(db, config.workspace_id, id, 'denied', opts.reason);
        console.log(`Denied: ${updated.id}`);
      } catch (err) {
        console.error(`Failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
