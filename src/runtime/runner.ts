import type Database from 'better-sqlite3';
import { generateId } from '../shared/ids.js';
import { appendAuditEntry } from '../audit/audit.js';
import type { PolicyDecision, AuditOutcome } from '../audit/audit.js';
import { checkBudget, recordBudgetUsage } from '../governance/budgets.js';
import { requiresApproval } from '../governance/policy.js';
import { createApproval } from '../governance/approvals.js';
import { logger } from '../shared/logger.js';
import { jsonHash } from '../shared/redact.js';
import type { Pipeline, RunResult, SkillStep, StepResult } from './types.js';
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

// Tool cost estimates – in production these come from tool manifests
const TOOL_COSTS: Record<string, { category: string; amount: number }> = {
  'cloned.mcp.youtube.video.upload@v1': { category: 'content_publish', amount: 1 },
  'cloned.mcp.github.issue.create@v1': { category: 'api_requests', amount: 1 },
  'cloned.mcp.github.pr.create@v1': { category: 'api_requests', amount: 1 },
  'cloned.mcp.web.search@v1': { category: 'api_requests', amount: 1 },
};

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

  logger.info('Run started', { run_id: runId, pipeline: pipeline.id, dry_run: ctx.dryRun });

  const stepResults: StepResult[] = [];
  let runStatus: RunResult['status'] = 'succeeded';

  for (const step of pipeline.steps) {
    const result = await executeStep(step, ctx, paths.auditLog);
    stepResults.push(result);

    if (result.outcome === 'failure') {
      runStatus = 'failed';
      break;
    }
  }

  const endedAt = new Date().toISOString();

  ctx.db.prepare(`UPDATE runs SET status = ?, ended_at = ? WHERE id = ?`).run(runStatus, endedAt, runId);

  logger.info('Run completed', { run_id: runId, status: runStatus });

  return {
    run_id: runId,
    pipeline_id: pipeline.id,
    status: runStatus,
    steps: stepResults,
    artifact_paths: [],
    started_at: startedAt,
    ended_at: endedAt,
  };
}

async function executeStep(
  step: SkillStep,
  ctx: RunnerContext,
  auditLogPath: string,
): Promise<StepResult> {
  logger.debug('Executing step', { step_id: step.id, tool: step.tool_id });

  // Closure to reduce repetition in audit calls
  const audit = (
    policy_decision: PolicyDecision,
    outcome: AuditOutcome,
    costs?: Record<string, number>,
  ) =>
    appendAuditEntry(ctx.db, auditLogPath, {
      actor: ctx.actor,
      workspace_id: ctx.workspaceId,
      tool_id: step.tool_id,
      input: step.input,
      policy_decision,
      outcome,
      costs,
      dry_run: ctx.dryRun,
    });

  // Check tool allowlist (constitution enforcement)
  if (step.allowed_tools && !step.allowed_tools.includes(step.tool_id)) {
    logger.warn('Tool blocked by constitution', { tool: step.tool_id, step: step.id });
    audit('deny', 'blocked');
    return {
      step_id: step.id,
      tool_id: step.tool_id,
      outcome: 'blocked',
      blocked_reason: `Tool ${step.tool_id} not in step allowlist`,
    };
  }

  // Check if approval required by policy
  const needsApproval = requiresApproval(ctx.policy, { tool_id: step.tool_id });
  if (needsApproval && !ctx.dryRun) {
    const approval = createApproval(ctx.db, ctx.workspaceId, step.tool_id, jsonHash(step.input), ctx.actor);
    logger.info('Approval required', { step: step.id, tool: step.tool_id, approval_id: approval.id });
    audit('approve_required', 'blocked');
    return {
      step_id: step.id,
      tool_id: step.tool_id,
      outcome: 'blocked',
      blocked_reason: `Approval required – approval ID: ${approval.id}`,
    };
  }

  // Check budget
  const costEstimate = TOOL_COSTS[step.tool_id] ?? null;
  if (costEstimate) {
    const budgetCheck = checkBudget(ctx.db, ctx.workspaceId, costEstimate);
    if (!budgetCheck.allowed) {
      audit('deny', 'blocked');
      return { step_id: step.id, tool_id: step.tool_id, outcome: 'blocked', blocked_reason: budgetCheck.reason };
    }
  }

  // Find handler
  const handler = toolHandlers.get(step.tool_id);
  if (!handler) {
    if (ctx.dryRun) {
      logger.info('[DRY RUN] Would execute tool (no handler registered)', { tool: step.tool_id });
      audit('dry_run', 'dry_run');
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

    if (costEstimate && !ctx.dryRun) {
      recordBudgetUsage(ctx.db, ctx.workspaceId, costEstimate);
    }

    const costs = costEstimate ? { [costEstimate.category]: costEstimate.amount } : undefined;
    audit(ctx.dryRun ? 'dry_run' : 'allow', ctx.dryRun ? 'dry_run' : 'success', costs);

    return { step_id: step.id, tool_id: step.tool_id, outcome: 'success', output };
  } catch (err) {
    audit('allow', 'failure');
    return { step_id: step.id, tool_id: step.tool_id, outcome: 'failure', error: (err as Error).message };
  }
}
