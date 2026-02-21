import type Database from 'better-sqlite3';
import { generateId } from '../shared/ids.js';
import { appendAuditEntry } from '../audit/audit.js';
import { checkBudget, recordBudgetUsage } from '../governance/budgets.js';
import { requiresApproval } from '../governance/policy.js';
import { createApproval } from '../governance/approvals.js';
import { logger } from '../shared/logger.js';
import type { Pipeline, RunRecord, RunResult, SkillStep, StepResult } from './types.js';
import type { PolicyPack } from '../governance/policy.js';
import { getClonedPaths } from '../workspace/paths.js';

export interface RunnerContext {
  db: Database.Database;
  workspaceId: string;
  policy: PolicyPack;
  actor: string;
  dryRun?: boolean;
  cwd?: string;
}

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

// Tool registry – handlers are registered by connectors
const toolHandlers = new Map<string, ToolHandler>();

export function registerTool(toolId: string, handler: ToolHandler): void {
  toolHandlers.set(toolId, handler);
}

export async function runPipeline(
  pipeline: Pipeline,
  ctx: RunnerContext,
): Promise<RunResult> {
  const runId = generateId();
  const startedAt = new Date().toISOString();
  const paths = getClonedPaths(ctx.cwd);

  // Insert run record
  ctx.db.prepare(`
    INSERT INTO runs (id, workspace_id, pipeline_id, status, started_at, created_by, dry_run)
    VALUES (?, ?, ?, 'running', ?, ?, ?)
  `).run(runId, ctx.workspaceId, pipeline.id, startedAt, ctx.actor, ctx.dryRun ? 1 : 0);

  logger.info('Run started', {
    run_id: runId,
    pipeline: pipeline.id,
    dry_run: ctx.dryRun,
  });

  const stepResults: StepResult[] = [];
  const artifactPaths: string[] = [];
  let runStatus: RunResult['status'] = 'succeeded';

  for (const step of pipeline.steps) {
    const result = await executeStep(step, ctx, paths.auditLog, runId);
    stepResults.push(result);

    if (result.outcome === 'failure') {
      runStatus = 'failed';
      break;
    }
  }

  const endedAt = new Date().toISOString();

  ctx.db.prepare(`
    UPDATE runs SET status = ?, ended_at = ? WHERE id = ?
  `).run(runStatus, endedAt, runId);

  logger.info('Run completed', { run_id: runId, status: runStatus });

  return {
    run_id: runId,
    pipeline_id: pipeline.id,
    status: runStatus,
    steps: stepResults,
    artifact_paths: artifactPaths,
    started_at: startedAt,
    ended_at: endedAt,
  };
}

async function executeStep(
  step: SkillStep,
  ctx: RunnerContext,
  auditLogPath: string,
  _runId: string,
): Promise<StepResult> {
  logger.debug('Executing step', { step_id: step.id, tool: step.tool_id });

  // Check tool allowlist (constitution enforcement)
  if (step.allowed_tools && !step.allowed_tools.includes(step.tool_id)) {
    const blocked_reason = `Tool ${step.tool_id} not in step allowlist`;
    logger.warn('Tool blocked by constitution', { tool: step.tool_id, step: step.id });

    appendAuditEntry(ctx.db, auditLogPath, {
      actor: ctx.actor,
      workspace_id: ctx.workspaceId,
      tool_id: step.tool_id,
      input: step.input,
      policy_decision: 'deny',
      outcome: 'blocked',
      dry_run: ctx.dryRun,
    });

    return { step_id: step.id, tool_id: step.tool_id, outcome: 'blocked', blocked_reason };
  }

  // Check if approval required by policy
  const needsApproval = requiresApproval(ctx.policy, { tool_id: step.tool_id });
  if (needsApproval && !ctx.dryRun) {
    const { jsonHash } = await import('../shared/redact.js');
    const payloadHash = jsonHash(step.input);
    const approval = createApproval(ctx.db, ctx.workspaceId, step.tool_id, payloadHash, ctx.actor);

    logger.info('Approval required', {
      step: step.id,
      tool: step.tool_id,
      approval_id: approval.id,
    });

    appendAuditEntry(ctx.db, auditLogPath, {
      actor: ctx.actor,
      workspace_id: ctx.workspaceId,
      tool_id: step.tool_id,
      input: step.input,
      policy_decision: 'approve_required',
      outcome: 'blocked',
      dry_run: ctx.dryRun,
    });

    return {
      step_id: step.id,
      tool_id: step.tool_id,
      outcome: 'blocked',
      blocked_reason: `Approval required – approval ID: ${approval.id}`,
    };
  }

  // Check budget
  const costEstimate = estimateCost(step.tool_id);
  if (costEstimate) {
    const budgetCheck = checkBudget(ctx.db, ctx.workspaceId, costEstimate);
    if (!budgetCheck.allowed) {
      appendAuditEntry(ctx.db, auditLogPath, {
        actor: ctx.actor,
        workspace_id: ctx.workspaceId,
        tool_id: step.tool_id,
        input: step.input,
        policy_decision: 'deny',
        outcome: 'blocked',
        dry_run: ctx.dryRun,
      });
      return {
        step_id: step.id,
        tool_id: step.tool_id,
        outcome: 'blocked',
        blocked_reason: budgetCheck.reason,
      };
    }
  }

  // Find handler
  const handler = toolHandlers.get(step.tool_id);
  if (!handler) {
    if (ctx.dryRun) {
      logger.info('[DRY RUN] Would execute tool (no handler registered)', {
        tool: step.tool_id,
      });
      appendAuditEntry(ctx.db, auditLogPath, {
        actor: ctx.actor,
        workspace_id: ctx.workspaceId,
        tool_id: step.tool_id,
        input: step.input,
        policy_decision: 'dry_run',
        outcome: 'dry_run',
        dry_run: true,
      });
      return { step_id: step.id, tool_id: step.tool_id, outcome: 'success', output: { dry_run: true } };
    }
    logger.warn('No tool handler registered', { tool: step.tool_id });
    return {
      step_id: step.id,
      tool_id: step.tool_id,
      outcome: 'failure',
      error: `No handler registered for tool: ${step.tool_id}`,
    };
  }

  try {
    const output = await handler(step.input);

    // Record budget usage
    if (costEstimate && !ctx.dryRun) {
      recordBudgetUsage(ctx.db, ctx.workspaceId, costEstimate);
    }

    appendAuditEntry(ctx.db, auditLogPath, {
      actor: ctx.actor,
      workspace_id: ctx.workspaceId,
      tool_id: step.tool_id,
      input: step.input,
      policy_decision: ctx.dryRun ? 'dry_run' : 'allow',
      costs: costEstimate ? { [costEstimate.category]: costEstimate.amount } : undefined,
      outcome: ctx.dryRun ? 'dry_run' : 'success',
      dry_run: ctx.dryRun,
    });

    return { step_id: step.id, tool_id: step.tool_id, outcome: 'success', output };
  } catch (err) {
    appendAuditEntry(ctx.db, auditLogPath, {
      actor: ctx.actor,
      workspace_id: ctx.workspaceId,
      tool_id: step.tool_id,
      input: step.input,
      policy_decision: 'allow',
      outcome: 'failure',
      dry_run: ctx.dryRun,
    });

    return {
      step_id: step.id,
      tool_id: step.tool_id,
      outcome: 'failure',
      error: (err as Error).message,
    };
  }
}

function estimateCost(toolId: string): { category: string; amount: number } | null {
  // Tool cost estimates – in production these come from tool manifests
  const costs: Record<string, { category: string; amount: number }> = {
    'cloned.mcp.youtube.video.upload@v1': { category: 'content_publish', amount: 1 },
    'cloned.mcp.github.issue.create@v1': { category: 'api_requests', amount: 1 },
    'cloned.mcp.github.pr.create@v1': { category: 'api_requests', amount: 1 },
    'cloned.mcp.web.search@v1': { category: 'api_requests', amount: 1 },
  };
  return costs[toolId] ?? null;
}
