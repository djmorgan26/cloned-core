import type { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBlueprints, selectBlueprint, generatePlanOfRecord } from '../../blueprint/engine.js';
import { getClonedPaths } from '../../workspace/paths.js';
import { readWorkspaceConfig } from '../../workspace/config.js';

export function registerOnboardCommand(program: Command): void {
  program
    .command('onboard')
    .description('Conversational onboarding – select a blueprint and generate a Plan of Record')
    .option('--goal <goal>', 'Your primary goal (skip interactive prompt)')
    .option('--blueprint <id>', 'Use a specific blueprint ID directly')
    .option('--dry-run', 'Show plan without making changes', false)
    .action(async (opts) => {
      const paths = getClonedPaths();

      let config;
      try {
        config = readWorkspaceConfig(paths.config);
      } catch {
        console.error('Workspace not initialized. Run: cloned init');
        process.exit(1);
      }

      const blueprints = loadBlueprints();

      if (blueprints.length === 0) {
        console.error('No blueprints found in BLUEPRINTS/ directory');
        process.exit(1);
      }

      console.log('\nCloned Onboarding\n');
      console.log('Available blueprints:');
      blueprints.forEach((bp, i) => {
        console.log(`  ${i + 1}. ${bp.id} – ${bp.goals.join(', ')}`);
      });

      let goal = opts.goal as string | undefined;

      if (!goal && !opts.blueprint) {
        // Interactive mode using inquirer
        try {
          const { default: inquirer } = await import('inquirer');
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'goal',
              message: 'What is your primary goal? (e.g., "create YouTube content", "build a GitHub app", "research a topic"):',
              validate: (v: string) => v.trim().length > 0 || 'Please enter a goal',
            },
          ]);
          goal = answers.goal as string;
        } catch {
          console.error('Interactive mode not available. Use --goal <goal>');
          process.exit(1);
        }
      }

      let selectedBlueprint = null;

      if (opts.blueprint) {
        selectedBlueprint = blueprints.find((bp) => bp.id === opts.blueprint) ?? null;
        if (!selectedBlueprint) {
          console.error(`Blueprint not found: ${opts.blueprint}`);
          process.exit(1);
        }
      } else {
        selectedBlueprint = selectBlueprint(blueprints, [goal!]);
      }

      if (!selectedBlueprint) {
        console.error('No matching blueprint found for your goal');
        process.exit(1);
      }

      console.log(`\nSelected blueprint: ${selectedBlueprint.id}`);
      console.log(`Goals: ${selectedBlueprint.goals.join(', ')}`);

      const plan = generatePlanOfRecord(selectedBlueprint, config.workspace_id);

      console.log('\n' + '─'.repeat(60));
      console.log(plan.markdown);
      console.log('─'.repeat(60));

      if (!opts.dryRun) {
        const planPath = join(paths.root, 'plan-of-record.md');
        writeFileSync(planPath, plan.markdown, 'utf8');
        console.log(`\nPlan of Record saved to: ${planPath}`);
      } else {
        console.log('\n[DRY RUN] Plan not saved.');
      }

      console.log('\nRequired manual steps:');
      plan.manual_steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step}`);
      });

      if (plan.connectors_needed.length > 0) {
        console.log('\nConnectors to install:');
        plan.connectors_needed.forEach(({ connector }) => {
          console.log(`  cloned connect ${connector.replace('connector.', '')}`);
        });
      }
    });
}
