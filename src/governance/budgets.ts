import type Database from 'better-sqlite3';
import type { WorkspaceTier } from '../workspace/types.js';

export interface BudgetCap {
  category: string;
  period: 'hour' | 'day' | 'week' | 'month';
  cap: number;
}

export interface BudgetStatus {
  workspace_id: string;
  category: string;
  period: string;
  cap: number;
  used: number;
  remaining: number;
  window_start: string;
}

// Default budget caps per tier
const TIER_BUDGETS: Record<WorkspaceTier, BudgetCap[]> = {
  personal: [
    { category: 'api_requests', period: 'month', cap: 10000 },
    { category: 'content_publish', period: 'month', cap: 5 },
    { category: 'cloud_compute', period: 'month', cap: 100 },
    { category: 'storage', period: 'month', cap: 10000 },
  ],
  shared: [
    { category: 'api_requests', period: 'month', cap: 50000 },
    { category: 'content_publish', period: 'month', cap: 50 },
    { category: 'cloud_compute', period: 'month', cap: 1000 },
    { category: 'storage', period: 'month', cap: 100000 },
  ],
  enterprise: [
    { category: 'api_requests', period: 'month', cap: 1000000 },
    { category: 'content_publish', period: 'month', cap: 1000 },
    { category: 'cloud_compute', period: 'month', cap: 100000 },
    { category: 'storage', period: 'month', cap: 10000000 },
  ],
};

export function initBudgets(
  db: Database.Database,
  workspaceId: string,
  tier: WorkspaceTier,
): void {
  const caps = TIER_BUDGETS[tier];
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO budgets (workspace_id, category, period, cap, window_start, used)
    VALUES (?, ?, ?, ?, ?, 0)
  `);

  const insertMany = db.transaction((items: BudgetCap[]) => {
    for (const item of items) {
      stmt.run(workspaceId, item.category, item.period, item.cap, now);
    }
  });

  insertMany(caps);
}

export function getBudgets(db: Database.Database, workspaceId: string): BudgetStatus[] {
  const rows = db
    .prepare(
      `SELECT workspace_id, category, period, cap, used, window_start
       FROM budgets WHERE workspace_id = ?`,
    )
    .all(workspaceId) as Array<{
    workspace_id: string;
    category: string;
    period: string;
    cap: number;
    used: number;
    window_start: string;
  }>;

  return rows.map((r) => ({
    ...r,
    remaining: Math.max(0, r.cap - r.used),
  }));
}

export interface CostEstimate {
  category: string;
  amount: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  budget?: BudgetStatus;
}

export function checkBudget(
  db: Database.Database,
  workspaceId: string,
  cost: CostEstimate,
): BudgetCheckResult {
  const row = db
    .prepare(
      `SELECT category, period, cap, used, window_start
       FROM budgets WHERE workspace_id = ? AND category = ?`,
    )
    .get(workspaceId, cost.category) as
    | {
        category: string;
        period: string;
        cap: number;
        used: number;
        window_start: string;
      }
    | undefined;

  if (!row) {
    // No budget defined for category – allow with warning
    return { allowed: true };
  }

  // Check if window needs rolling
  const budget = maybeRollWindow(db, workspaceId, row);

  if (budget.used + cost.amount > budget.cap) {
    return {
      allowed: false,
      reason: `Budget exceeded for ${cost.category}: ${budget.used}/${budget.cap} (adding ${cost.amount})`,
      budget: {
        workspace_id: workspaceId,
        ...budget,
        remaining: Math.max(0, budget.cap - budget.used),
      },
    };
  }

  return {
    allowed: true,
    budget: {
      workspace_id: workspaceId,
      ...budget,
      remaining: Math.max(0, budget.cap - budget.used - cost.amount),
    },
  };
}

export function recordBudgetUsage(
  db: Database.Database,
  workspaceId: string,
  cost: CostEstimate,
): void {
  db.prepare(
    `UPDATE budgets SET used = used + ? WHERE workspace_id = ? AND category = ?`,
  ).run(cost.amount, workspaceId, cost.category);
}

export function checkAndRecordBudget(
  db: Database.Database,
  workspaceId: string,
  cost: CostEstimate,
): BudgetCheckResult {
  return db.transaction(() => {
    const result = checkBudget(db, workspaceId, cost);
    if (result.allowed) {
      recordBudgetUsage(db, workspaceId, cost);
    }
    return result;
  })();
}

function maybeRollWindow(
  db: Database.Database,
  workspaceId: string,
  row: { category: string; period: string; cap: number; used: number; window_start: string },
): { category: string; period: string; cap: number; used: number; window_start: string } {
  const windowStart = new Date(row.window_start);
  const now = new Date();
  let needsRoll = false;

  switch (row.period) {
    case 'hour':
      needsRoll = now.getTime() - windowStart.getTime() > 3600_000;
      break;
    case 'day':
      needsRoll = now.getTime() - windowStart.getTime() > 86_400_000;
      break;
    case 'week':
      needsRoll = now.getTime() - windowStart.getTime() > 7 * 86_400_000;
      break;
    case 'month':
      needsRoll =
        now.getMonth() !== windowStart.getMonth() ||
        now.getFullYear() !== windowStart.getFullYear();
      break;
  }

  if (needsRoll) {
    const newStart = now.toISOString();
    db.prepare(
      `UPDATE budgets SET used = 0, window_start = ? WHERE workspace_id = ? AND category = ?`,
    ).run(newStart, workspaceId, row.category);
    return { ...row, used: 0, window_start: newStart };
  }

  return row;
}
