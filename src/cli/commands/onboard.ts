import type { Command } from 'commander';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadBlueprints, selectBlueprint, generatePlanOfRecord } from '../../blueprint/engine.js';
import type { Blueprint } from '../../blueprint/engine.js';
import { requireWorkspace } from '../cli-shared.js';
import { getVaultProvider } from '../../vault/index.js';

export function registerOnboardCommand(program: Command): void {
  program
    .command('onboard')
    .description('Conversational onboarding – select a blueprint and generate a Plan of Record')
    .option('--goal <goal>', 'Your primary goal (skip interactive prompt)')
    .option('--blueprint <id>', 'Use a specific blueprint ID directly')
    .option('--dry-run', 'Show plan without making changes', false)
    .action(async (opts) => {
      const { paths, config } = requireWorkspace();

      const blueprints = loadBlueprints();

      if (blueprints.length === 0) {
        console.error('No blueprints found in blueprints/ directory');
        process.exit(1);
      }

      console.log('\nCloned Onboarding\n');
      console.log('Available blueprints:');
      blueprints.forEach((bp, i) => {
        console.log(`  ${i + 1}. [${bp.id}] ${bp.title}`);
        console.log(`     ${bp.description}`);
      });
      console.log();

      let goal = opts.goal as string | undefined;

      if (!goal && !opts.blueprint) {
        try {
          const { default: inquirer } = await import('inquirer');
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'goal',
              message:
                'What is your primary goal? ' +
                '(e.g. "research a topic", "create YouTube content", "build a GitHub app"):',
              validate: (v: string) => v.trim().length > 0 || 'Please enter a goal',
            },
          ]);
          goal = answers.goal as string;
        } catch {
          console.error('Interactive mode not available. Use --goal <goal>');
          process.exit(1);
        }
      }

      let maybeBlueprint: Blueprint | null = null;

      if (opts.blueprint) {
        maybeBlueprint = blueprints.find((bp) => bp.id === opts.blueprint) ?? null;
        if (!maybeBlueprint) {
          console.error(`Blueprint not found: ${opts.blueprint}`);
          console.error('Available IDs:', blueprints.map((b) => b.id).join(', '));
          process.exit(1);
        }
      } else {
        maybeBlueprint = selectBlueprint(blueprints, [goal!]);
      }

      if (!maybeBlueprint) {
        console.error('No matching blueprint found for your goal');
        process.exit(1);
      }

      // Safe to assert non-null here – we exited above if null
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const selectedBlueprint = maybeBlueprint!;

      console.log(`\nSelected blueprint: ${selectedBlueprint.title} [${selectedBlueprint.id}]`);

      const plan = generatePlanOfRecord(selectedBlueprint, config.workspace_id);

      console.log('\n' + '-'.repeat(60));
      console.log(plan.markdown);
      console.log('-'.repeat(60));

      // Check connector status from vault
      const vault = getVaultProvider(`${paths.root}/vault.dev.json`);
      console.log('\nConnector status:');
      for (const { connector } of plan.connectors_needed) {
        const isConnected = await checkConnectorConnected(connector, vault);
        const status = isConnected ? 'connected' : 'not connected';
        const hint = isConnected
          ? 'connected'
          : `run: cloned connect ${connector.replace('connector.', '')}`;
        console.log(`  [${status}] ${connector}: ${hint}`);
      }

      if (!opts.dryRun) {
        const plansDir = join(paths.root, 'plans');
        if (!existsSync(plansDir)) mkdirSync(plansDir, { recursive: true, mode: 0o700 });
        const planPath = join(plansDir, `${selectedBlueprint.id}.md`);
        writeFileSync(planPath, plan.markdown, 'utf8');
        console.log(`\nPlan of Record saved to: ${planPath}`);
      } else {
        console.log('\n[DRY RUN] Plan not saved.');
      }

      if (plan.manual_steps.length > 0) {
        console.log('\nRequired manual steps:');
        plan.manual_steps.forEach((step, i) => {
          console.log(`  ${i + 1}. ${step}`);
        });
      }

      if (selectedBlueprint.first_run_pipeline) {
        console.log(`\nWhen ready, run: cloned run ${selectedBlueprint.first_run_pipeline}`);
      }
    });
}

/**
 * A connector is "connected" if its primary vault secret exists.
 */
async function checkConnectorConnected(
  connectorId: string,
  vault: ReturnType<typeof getVaultProvider>,
): Promise<boolean> {
  const secretKeys: Record<string, string> = {
    'connector.github.app': 'github.oauth.access_token',
    'connector.youtube.oauth': 'youtube.oauth.access_token',
    'connector.web.search': '', // no auth required
    'connector.slack.bot': 'slack.bot.token',
  };
  const key = secretKeys[connectorId];
  if (key === '') return true; // No auth needed
  if (!key) return false;
  const val = await vault.getSecret(key);
  return val !== null;
}
