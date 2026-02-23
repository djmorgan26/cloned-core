import type { Command } from 'commander';
import { requireWorkspace } from '../cli-shared.js';
import { loadPolicyPack } from '../../governance/policy.js';
import { runPipeline } from '../../runtime/runner.js';
import { BUILT_IN_PIPELINES } from '../../runtime/pipelines.js';
import { registerBuiltinTools } from '../../runtime/tools/index.js';
import { DockerContainerRunner, type SandboxMode } from '../../runtime/container-runner.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run <pipeline>')
    .description('Run a pipeline')
    .option('--dry-run', 'Simulate run without executing actions', false)
    .option('--input <json>', 'JSON input variables for the pipeline (e.g. \'{"topic":"AI safety"}\')')
    .option('--topic <topic>', 'Shorthand: set the "topic" input variable')
    .option('--sandbox <mode>', 'Sandbox mode for connectors (process|container)', 'process')
    .action(async (pipelineId: string, opts) => {
      const { paths, config, db } = requireWorkspace();

      const pipeline = BUILT_IN_PIPELINES[pipelineId];
      if (!pipeline) {
        console.error(`Pipeline not found: ${pipelineId}`);
        console.error('Available pipelines:', Object.keys(BUILT_IN_PIPELINES).join(', '));
        process.exit(1);
      }

      const policy = loadPolicyPack(config.policy_pack, paths.policyDir);

      const sandbox = String(opts.sandbox ?? 'process') as SandboxMode;
      if (!['process', 'container'].includes(sandbox)) {
        console.error('Invalid sandbox mode. Use "process" or "container".');
        process.exit(1);
      }

      let containerRunner: DockerContainerRunner | undefined;
      if (sandbox === 'container') {
        const proxyUrl = process.env['CLONED_EGRESS_PROXY'] ?? config.network?.egress_proxy;
        containerRunner = new DockerContainerRunner({ proxyUrl });
      }

      // Register built-in tool handlers before running
      registerBuiltinTools(config.policy_pack, {
        cwd: process.cwd(),
        sandboxMode: sandbox,
        containerRunner,
        db,
        workspaceId: config.workspace_id,
        vaultProvider: config.vault_provider,
        vaultFilePath: `${paths.root}/vault.dev.json`,
      });

      // Build runtime variables from CLI flags
      let vars: Record<string, unknown> = {};
      if (opts.input) {
        try {
          vars = JSON.parse(opts.input as string);
        } catch {
          console.error('Invalid JSON in --input. Example: --input \'{"topic":"AI safety"}\'');
          process.exit(1);
        }
      }
      if (opts.topic) {
        vars['topic'] = opts.topic;
      }

      console.log(`Running pipeline: ${pipeline.name}`);
      if (opts.dryRun) console.log('[DRY RUN] – no actions will be executed');
      if (Object.keys(vars).length > 0) {
        console.log('Variables:', JSON.stringify(vars));
      }

      try {
        const result = await runPipeline(pipeline, {
          db,
          workspaceId: config.workspace_id,
          policy,
          actor: 'cli',
          dryRun: opts.dryRun,
          cwd: process.cwd(),
          vars,
        });

        console.log(`\nRun completed: ${result.status}`);
        console.log(`Run ID: ${result.run_id}`);

        for (const step of result.steps) {
          const icon =
            step.outcome === 'success'
              ? '[ok]'
              : step.outcome === 'blocked'
                ? '[blocked]'
                : '[fail]';
          console.log(`  ${icon} ${step.step_id} (${step.tool_id}): ${step.outcome}`);
          if (step.blocked_reason) console.log(`    Blocked: ${step.blocked_reason}`);
          if (step.error) console.log(`    Error: ${step.error}`);
        }

        if (result.artifact_paths.length > 0) {
          console.log('\nArtifacts saved:');
          result.artifact_paths.forEach((p) => console.log(`  ${p}`));
        }
      } catch (err) {
        console.error(`Run failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
