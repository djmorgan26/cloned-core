interface AuditRow {
  id: string;
  timestamp: string;
  actor: string;
  workspace_id: string;
  tool_id: string | null;
  tool_version: string | null;
  schema_id: string | null;
  input_hash: string;
  policy_decision: string;
  costs_json: string | null;
  outcome: string;
  artifact_manifest_hash: string | null;
  dry_run: number;
  chain_prev_hash: string | null;
  chain_this_hash: string | null;
}

interface ApprovalRow {
  id: string;
  created_at: string;
  actor: string | null;
  workspace_id: string;
  scope: string;
  payload_hash: string;
  status: string;
  decided_at: string | null;
  decision_reason: string | null;
  chain_prev_hash: string | null;
  chain_this_hash: string | null;
}

interface BudgetRow {
  workspace_id: string;
  category: string;
  period: string;
  cap: number;
  window_start: string;
  used: number;
}

type TableMap = {
  audit_log: AuditRow[];
  approvals: ApprovalRow[];
  budgets: BudgetRow[];
};

class MemoryStatement {
  constructor(private db: MemoryDatabase, private sql: string) {}

  run(...params: unknown[]) {
    return this.db._run(this.sql, params);
  }

  get(...params: unknown[]) {
    return this.db._get(this.sql, params);
  }

  all(...params: unknown[]) {
    return this.db._all(this.sql, params);
  }
}

export default class MemoryDatabase {
  private tables: TableMap = {
    audit_log: [],
    approvals: [],
    budgets: [],
  };

  constructor(_path?: string) {}

  pragma(_stmt: string): void {}

  exec(sql: string): void {
    if (sql.includes('audit_log')) this.ensure('audit_log');
    if (sql.includes('approvals')) this.ensure('approvals');
    if (sql.includes('budgets')) this.ensure('budgets');
  }

  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return ((...args: unknown[]) => fn(...args)) as T;
  }

  prepare(sql: string): MemoryStatement {
    return new MemoryStatement(this, sql);
  }

  private ensure(table: keyof TableMap) {
    if (!this.tables[table]) {
      this.tables[table] = [] as never;
    }
  }

  _run(sql: string, params: unknown[]) {
    if (sql.includes('INSERT INTO audit_log')) {
      const [id, timestamp, actor, workspace_id, tool_id, tool_version, schema_id, input_hash, policy_decision, costs_json, outcome, artifact_manifest_hash, dry_run, chain_prev_hash, chain_this_hash] = params as [string, string, string, string, string | null, string | null, string | null, string, string, string | null, string, string | null, number, string | null, string | null];
      this.tables.audit_log.push({
        id,
        timestamp,
        actor,
        workspace_id,
        tool_id: tool_id ?? null,
        tool_version: tool_version ?? null,
        schema_id: schema_id ?? null,
        input_hash,
        policy_decision,
        costs_json: costs_json ?? null,
        outcome,
        artifact_manifest_hash: artifact_manifest_hash ?? null,
        dry_run: dry_run ? 1 : 0,
        chain_prev_hash: chain_prev_hash ?? null,
        chain_this_hash: chain_this_hash ?? null,
      });
      return { changes: 1 };
    }

    if (sql.includes('INSERT INTO approvals')) {
      const [id, created_at, actor, workspace_id, scope, payload_hash, status, decided_at, decision_reason, chain_prev_hash, chain_this_hash] = params as [string, string, string | null, string, string, string, string, string | null, string | null, string | null, string | null];
      this.tables.approvals.push({
        id,
        created_at,
        actor: actor ?? null,
        workspace_id,
        scope,
        payload_hash,
        status,
        decided_at: decided_at ?? null,
        decision_reason: decision_reason ?? null,
        chain_prev_hash: chain_prev_hash ?? null,
        chain_this_hash: chain_this_hash ?? null,
      });
      return { changes: 1 };
    }

    if (sql.includes('UPDATE approvals')) {
      const [status, decided_at, decision_reason, chain_prev_hash, chain_this_hash, approvalId] = params as [string, string, string | null, string | null, string | null, string];
      const row = this.tables.approvals.find((r) => r.id === approvalId);
      if (row) {
        row.status = status;
        row.decided_at = decided_at;
        row.decision_reason = decision_reason ?? null;
        row.chain_prev_hash = chain_prev_hash ?? null;
        row.chain_this_hash = chain_this_hash ?? null;
      }
      return { changes: row ? 1 : 0 };
    }

    if (sql.includes('INSERT OR IGNORE INTO budgets')) {
      const [workspace_id, category, period, cap, window_start] = params as [string, string, string, number, string];
      const exists = this.tables.budgets.find((b) => b.workspace_id === workspace_id && b.category === category);
      if (!exists) {
        this.tables.budgets.push({ workspace_id, category, period, cap, window_start, used: 0 });
      }
      return { changes: exists ? 0 : 1 };
    }

    if (sql.includes('UPDATE budgets SET used = used +')) {
      const [amount, workspace_id, category] = params as [number, string, string];
      const row = this.tables.budgets.find((b) => b.workspace_id === workspace_id && b.category === category);
      if (row) row.used += amount;
      return { changes: row ? 1 : 0 };
    }

    if (sql.includes('UPDATE budgets SET used = 0') && sql.includes('window_start')) {
      const [window_start, workspace_id, category] = params as [string, string, string];
      const row = this.tables.budgets.find((b) => b.workspace_id === workspace_id && b.category === category);
      if (row) {
        row.used = 0;
        row.window_start = window_start;
      }
      return { changes: row ? 1 : 0 };
    }

    if (sql.includes('UPDATE budgets SET used =') && sql.includes('WHERE workspace_id = ? AND category = ?') && !sql.includes('used +')) {
      const match = /UPDATE budgets SET used =\s*(\d+)/.exec(sql);
      const newValue = match ? Number(match[1]) : 0;
      const [workspace_id, category] = params as [string, string];
      const row = this.tables.budgets.find((b) => b.workspace_id === workspace_id && b.category === category);
      if (row) row.used = newValue;
      return { changes: row ? 1 : 0 };
    }

    throw new Error(`Unsupported SQL run operation: ${sql}`);
  }

  _get(sql: string, params: unknown[]) {
    if (sql.includes('SELECT chain_this_hash FROM audit_log')) {
      const [workspace_id] = params as [string];
      const rows = this.tables.audit_log
        .filter((r) => r.workspace_id === workspace_id)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      return rows[0] ? { chain_this_hash: rows[0].chain_this_hash } : undefined;
    }

    if (sql.includes('SELECT * FROM audit_log WHERE id')) {
      const [id] = params as [string];
      return this.tables.audit_log.find((r) => r.id === id);
    }

    if (sql.includes('SELECT chain_this_hash FROM approvals')) {
      const [workspace_id] = params as [string];
      const rows = this.tables.approvals
        .filter((r) => r.workspace_id === workspace_id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return rows[0] ? { chain_this_hash: rows[0].chain_this_hash } : undefined;
    }

    if (sql.includes('SELECT * FROM approvals WHERE id')) {
      const [id, workspace_id] = params as [string, string];
      return this.tables.approvals.find((r) => r.id === id && r.workspace_id === workspace_id);
    }

    if (sql.includes('SELECT category, period, cap, used, window_start') && sql.includes('FROM budgets WHERE workspace_id')) {
      const [workspace_id, category] = params as [string, string];
      return this.tables.budgets.find((b) => b.workspace_id === workspace_id && b.category === category);
    }

    throw new Error(`Unsupported SQL get operation: ${sql}`);
  }

  _all(sql: string, params: unknown[]) {
    if (sql.includes('SELECT * FROM audit_log WHERE workspace_id')) {
      const [workspace_id, limit, offset] = params as [string, number, number];
      const rows = this.tables.audit_log
        .filter((r) => r.workspace_id === workspace_id)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      return rows.slice(offset ?? 0, (offset ?? 0) + (limit ?? rows.length));
    }

    if (sql.includes('SELECT * FROM approvals WHERE workspace_id = ? AND status = ?')) {
      const [workspace_id, status] = params as [string, string];
      return this.tables.approvals
        .filter((r) => r.workspace_id === workspace_id && r.status === status)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }

    if (sql.includes('SELECT * FROM approvals WHERE workspace_id = ? ORDER BY created_at DESC')) {
      const [workspace_id] = params as [string];
      return this.tables.approvals
        .filter((r) => r.workspace_id === workspace_id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }

    if (sql.includes('SELECT workspace_id, category, period, cap, used, window_start')) {
      const [workspace_id] = params as [string];
      return this.tables.budgets.filter((b) => b.workspace_id === workspace_id);
    }

    throw new Error(`Unsupported SQL all operation: ${sql}`);
  }
}
