import { describe, it, expect, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { createApproval, decideApproval, listApprovals } from '../governance/approvals.js';
import { checkBudget, recordBudgetUsage, initBudgets, getBudgets } from '../governance/budgets.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      actor TEXT,
      workspace_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','approved','denied')),
      decided_at TEXT,
      decision_reason TEXT,
      chain_prev_hash TEXT,
      chain_this_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS budgets (
      workspace_id TEXT NOT NULL,
      category TEXT NOT NULL,
      period TEXT NOT NULL CHECK (period IN ('hour','day','week','month')),
      cap REAL NOT NULL,
      window_start TEXT NOT NULL,
      used REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (workspace_id, category)
    );
  `);
  return db;
}

describe('Approvals', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates a pending approval with chain hash', () => {
    const approval = createApproval(db, 'ws1', 'content_publish', 'hash123', 'agent');
    expect(approval.status).toBe('pending');
    expect(approval.scope).toBe('content_publish');
    expect(approval.chain_this_hash).toBeTruthy();
    expect(approval.chain_prev_hash).toBeNull();
  });

  it('chains approval hashes', () => {
    const a1 = createApproval(db, 'ws1', 'scope1', 'hash1', 'agent');
    const a2 = createApproval(db, 'ws1', 'scope2', 'hash2', 'agent');
    expect(a2.chain_prev_hash).toBe(a1.chain_this_hash);
    expect(a2.chain_this_hash).not.toBe(a1.chain_this_hash);
  });

  it('can approve a pending approval', () => {
    const approval = createApproval(db, 'ws1', 'content_publish', 'hash123', 'agent');
    const decided = decideApproval(db, 'ws1', approval.id, 'approved', 'Looks good');
    expect(decided.status).toBe('approved');
    expect(decided.decision_reason).toBe('Looks good');
    expect(decided.decided_at).toBeTruthy();
  });

  it('can deny a pending approval', () => {
    const approval = createApproval(db, 'ws1', 'content_publish', 'hash123', 'agent');
    const decided = decideApproval(db, 'ws1', approval.id, 'denied', 'Too risky');
    expect(decided.status).toBe('denied');
  });

  it('cannot decide already-decided approval', () => {
    const approval = createApproval(db, 'ws1', 'scope', 'hash', 'agent');
    decideApproval(db, 'ws1', approval.id, 'approved');
    expect(() => decideApproval(db, 'ws1', approval.id, 'denied')).toThrow();
  });

  it('lists approvals by status', () => {
    createApproval(db, 'ws1', 'scope1', 'hash1');
    const a2 = createApproval(db, 'ws1', 'scope2', 'hash2');
    decideApproval(db, 'ws1', a2.id, 'approved');

    const pending = listApprovals(db, 'ws1', { status: 'pending' });
    const approved = listApprovals(db, 'ws1', { status: 'approved' });

    expect(pending).toHaveLength(1);
    expect(approved).toHaveLength(1);
  });
});

describe('Budgets', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createTestDb();
    await initBudgets(db, 'ws1', 'personal');
  });

  it('initializes budgets for personal tier', () => {
    const budgets = getBudgets(db, 'ws1');
    expect(budgets.length).toBeGreaterThan(0);
    const apiReqs = budgets.find((b) => b.category === 'api_requests');
    expect(apiReqs).toBeDefined();
    expect(apiReqs?.cap).toBe(10000);
    expect(apiReqs?.used).toBe(0);
  });

  it('allows usage within budget', () => {
    const result = checkBudget(db, 'ws1', { category: 'api_requests', amount: 100 });
    expect(result.allowed).toBe(true);
  });

  it('blocks usage exceeding budget', async () => {
    await initBudgets(db, 'ws_small', 'personal');
    // Set used to near cap
    db.prepare(`UPDATE budgets SET used = 9999 WHERE workspace_id = ? AND category = ?`)
      .run('ws_small', 'api_requests');

    const result = checkBudget(db, 'ws_small', { category: 'api_requests', amount: 5 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Budget exceeded');
  });

  it('records usage', () => {
    recordBudgetUsage(db, 'ws1', { category: 'api_requests', amount: 10 });
    const budgets = getBudgets(db, 'ws1');
    const apiReqs = budgets.find((b) => b.category === 'api_requests');
    expect(apiReqs?.used).toBe(10);
    expect(apiReqs?.remaining).toBe(9990);
  });
});
