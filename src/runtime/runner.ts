import type Database from 'better-sqlite3';
import { generateId } from '../shared/ids.js';
import { appendAuditEntry } from '../audit/audit.js';
import type { PolicyDecision, AuditOutcome } from '../audit/audit.js';
import { checkBudget, checkAndRecordBudget } from '../governance/budgets.js';
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
  /** Runtime variables injected into pipeline step inputs via {{varName}} templates. */
  vars?: Record<string, unknown>;
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

/**
 * Resolve {{varName}} and {{step.<id>.output}} template expressions in a value.
 * Works recursively on strings, arrays, and plain objects.
 */
function resolveTemplate(
  value: unknown,
  vars: Record<string, unknown>,
  stepOutputs: Map<string, unknown>,
): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
      const trimmed = expr.trim();

      // {{step.<id>.output}} – previous step output
      const stepMatch = /^step\.([^.]+)\.output$/.exec(trimmed);
      if (stepMatch) {
        const stepId = stepMatch[1]!;
        const output = stepOutputs.get(stepId);
        if (output === undefined) return _match; // Leave unresolved
        return typeof output === 'string' ? output : JSON.stringify(output);
      }

      // {{varName}} – runtime variable
      if (trimmed in vars) {
        const v = vars[trimmed];
        return typeof v === 'string' ? v : JSON.stringify(v);
      }

      return _match; // Unresolvable – keep as-is
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplate(item, vars, stepOutputs));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveTemplate(v, vars, stepOutputs);
    }
    return result;
  }

  return value;
}

export async function runPipeline(
  pipeline: Pipeline,
  ctx: RunnerContext,
): Promise<RunResult> {
  const runId = generateId();
  const startedAt = new Date().toISOString();
  const paths = getClonedPaths(ctx.cwd);
  const vars = ctx.vars ?? {};

  // Insert run record
  ctx.db.prepare(`
    INSERT INTO runs (id, workspace_id, pipeline_id, status, started_at, created_by, dry_run)
    VALUES (?, ?, ?, 'running', ?, ?, ?)
  `).run(runId, ctx.workspaceId, pipeline.id, startedAt, ctx.actor, ctx.dryRun ? 1 : 0);

  logger.info('Run started', { run_id: runId, pipeline: pipeline.id, dry_run: ctx.dryRun });

  const stepResults: StepResult[] = [];
  const stepOutputs = new Map<string, unknown>();
  let runStatus: RunResult['status'] = 'succeeded';
  const artifactPaths: string[] = [];

  for (const step of pipeline.steps) {
    // Resolve template variables in step input before execution
    const resolvedInput = resolveTemplate(step.input, vars, stepOutputs) as Record<string, unknown>;
    const resolvedStep: SkillStep = { ...step, input: resolvedInput };

    const result = await executeStep(resolvedStep, ctx, paths.auditLog);
    stepResults.push(result);

    if (result.outcome === 'success') {
      // Store output for downstream template resolution
      stepOutputs.set(step.id, result.output);

      // Collect artifact paths if this was an artifact-save step
      if (step.tool_id === 'cloned.internal.artifact.save@v1' && result.output) {
        const out = result.output as { path?: string };
        if (out.path) artifactPaths.push(out.path);
      }
    } else if (result.outcome === 'failure') {
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
    artifact_paths: artifactPaths,
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

  // Check budget (atomically record usage for real runs)
  const costEstimate = TOOL_COSTS[step.tool_id] ?? null;
  if (!costEstimate) {
    logger.debug('No cost estimate for tool – budget not enforced', { tool: step.tool_id });
  }
  if (costEstimate) {
    const budgetCheck = ctx.dryRun
      ? checkBudget(ctx.db, ctx.workspaceId, costEstimate)
      : checkAndRecordBudget(ctx.db, ctx.workspaceId, costEstimate);
    if (!budgetCheck.allowed) {
      audit('deny', 'blocked');
      return { step_id: step.id, tool_id: step.tool_id, outcome: 'blocked', blocked_reason: budgetCheck.reason };
    }
  }

  // In dry-run mode, simulate success without calling the handler
  if (ctx.dryRun) {
    logger.info('[DRY RUN] Would execute tool', { tool: step.tool_id });
    audit('dry_run', 'dry_run');
    return { step_id: step.id, tool_id: step.tool_id, outcome: 'success', output: { dry_run: true } };
  }

  // Find handler
  const handler = toolHandlers.get(step.tool_id);
  if (!handler) {
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

    const costs = costEstimate ? { [costEstimate.category]: costEstimate.amount } : undefined;
    audit('allow', 'success', costs);

    return { step_id: step.id, tool_id: step.tool_id, outcome: 'success', output };
  } catch (err) {
    audit('allow', 'failure');
    return { step_id: step.id, tool_id: step.tool_id, outcome: 'failure', error: (err as Error).message };
  }
}
