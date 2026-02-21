import type { Command } from 'commander';
import { getClonedPaths } from '../../workspace/paths.js';
import { readWorkspaceConfig } from '../../workspace/config.js';
import { openDb } from '../../workspace/db.js';
import { loadPolicyPack } from '../../governance/policy.js';
import { runPipeline } from '../../runtime/runner.js';
import { researchPipeline } from '../../runtime/skills/researcher.js';
import { builderPipeline } from '../../runtime/skills/builder.js';
import { creatorPipeline } from '../../runtime/skills/creator.js';

const BUILT_IN_PIPELINES = {
  'pipeline.research.report': researchPipeline,
  'pipeline.builder.scaffold': builderPipeline,
  'pipeline.creator.youtube': creatorPipeline,
};

export function registerRunCommand(program: Command): void {
  program
    .command('run <pipeline>')
    .description('Run a pipeline')
    .option('--dry-run', 'Simulate run without executing actions', false)
    .option('--input <json>', 'JSON input for the pipeline')
    .action(async (pipelineId: string, opts) => {
      const paths = getClonedPaths();

      let config;
      try {
        config = readWorkspaceConfig(paths.config);
      } catch {
        console.error('Workspace not initialized. Run: cloned init');
        process.exit(1);
      }

      const pipeline = BUILT_IN_PIPELINES[pipelineId as keyof typeof BUILT_IN_PIPELINES];
      if (!pipeline) {
        console.error(`Pipeline not found: ${pipelineId}`);
        console.error('Available pipelines:', Object.keys(BUILT_IN_PIPELINES).join(', '));
        process.exit(1);
      }

      const db = openDb(paths.stateDb);
      const policy = loadPolicyPack(config.policy_pack);

      console.log(`Running pipeline: ${pipeline.name}`);
      if (opts.dryRun) console.log('[DRY RUN] – no actions will be executed');

      try {
        const result = await runPipeline(pipeline, {
          db,
          workspaceId: config.workspace_id,
          policy,
          actor: 'cli',
          dryRun: opts.dryRun,
          cwd: process.cwd(),
        });

        console.log(`\nRun completed: ${result.status}`);
        console.log(`Run ID: ${result.run_id}`);

        for (const step of result.steps) {
          const icon =
            step.outcome === 'success'
              ? '✓'
              : step.outcome === 'blocked'
                ? '⊘'
                : '✗';
          console.log(`  ${icon} ${step.step_id} (${step.tool_id}): ${step.outcome}`);
          if (step.blocked_reason) console.log(`    Blocked: ${step.blocked_reason}`);
          if (step.error) console.log(`    Error: ${step.error}`);
        }

        if (result.artifact_paths.length > 0) {
          console.log('\nArtifacts:');
          result.artifact_paths.forEach((p) => console.log(`  ${p}`));
        }
      } catch (err) {
        console.error(`Run failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
