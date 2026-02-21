import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { generateId } from '../shared/ids.js';

export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface ApprovalRecord {
  id: string;
  created_at: string;
  actor: string | null;
  workspace_id: string;
  scope: string;
  payload_hash: string;
  status: ApprovalStatus;
  decided_at: string | null;
  decision_reason: string | null;
  chain_prev_hash: string | null;
  chain_this_hash: string | null;
}

function computeChainHash(prev: string | null, entry: Omit<ApprovalRecord, 'chain_this_hash'>): string {
  const canonical = JSON.stringify({
    id: entry.id,
    created_at: entry.created_at,
    actor: entry.actor,
    workspace_id: entry.workspace_id,
    scope: entry.scope,
    payload_hash: entry.payload_hash,
    status: entry.status,
    decided_at: entry.decided_at,
    decision_reason: entry.decision_reason,
    chain_prev_hash: prev,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function getLastApprovalHash(db: Database.Database, workspaceId: string): string | null {
  const row = db
    .prepare(
      `SELECT chain_this_hash FROM approvals WHERE workspace_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(workspaceId) as { chain_this_hash: string | null } | undefined;
  return row?.chain_this_hash ?? null;
}

export function createApproval(
  db: Database.Database,
  workspaceId: string,
  scope: string,
  payloadHash: string,
  actor?: string,
): ApprovalRecord {
  const id = generateId();
  const created_at = new Date().toISOString();
  const chain_prev_hash = getLastApprovalHash(db, workspaceId);

  const partial: Omit<ApprovalRecord, 'chain_this_hash'> = {
    id,
    created_at,
    actor: actor ?? null,
    workspace_id: workspaceId,
    scope,
    payload_hash: payloadHash,
    status: 'pending',
    decided_at: null,
    decision_reason: null,
    chain_prev_hash,
  };

  const chain_this_hash = computeChainHash(chain_prev_hash, partial);

  const record: ApprovalRecord = { ...partial, chain_this_hash };

  db.prepare(`
    INSERT INTO approvals
      (id, created_at, actor, workspace_id, scope, payload_hash, status,
       decided_at, decision_reason, chain_prev_hash, chain_this_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.created_at,
    record.actor,
    record.workspace_id,
    record.scope,
    record.payload_hash,
    record.status,
    record.decided_at,
    record.decision_reason,
    record.chain_prev_hash,
    record.chain_this_hash,
  );

  return record;
}

export function decideApproval(
  db: Database.Database,
  workspaceId: string,
  approvalId: string,
  decision: 'approved' | 'denied',
  reason?: string,
): ApprovalRecord {
  const existing = db
    .prepare(`SELECT * FROM approvals WHERE id = ? AND workspace_id = ?`)
    .get(approvalId, workspaceId) as ApprovalRecord | undefined;

  if (!existing) {
    throw new Error(`Approval ${approvalId} not found`);
  }
  if (existing.status !== 'pending') {
    throw new Error(`Approval ${approvalId} is already ${existing.status}`);
  }

  const decided_at = new Date().toISOString();
  const chain_prev_hash = getLastApprovalHash(db, workspaceId);

  const partial: Omit<ApprovalRecord, 'chain_this_hash'> = {
    ...existing,
    status: decision,
    decided_at,
    decision_reason: reason ?? null,
    chain_prev_hash,
  };

  const chain_this_hash = computeChainHash(chain_prev_hash, partial);

  db.prepare(`
    UPDATE approvals
    SET status = ?, decided_at = ?, decision_reason = ?,
        chain_prev_hash = ?, chain_this_hash = ?
    WHERE id = ?
  `).run(decision, decided_at, reason ?? null, chain_prev_hash, chain_this_hash, approvalId);

  return { ...partial, chain_this_hash };
}

export function listApprovals(
  db: Database.Database,
  workspaceId: string,
  filter?: { status?: ApprovalStatus },
): ApprovalRecord[] {
  if (filter?.status) {
    return db
      .prepare(`SELECT * FROM approvals WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC`)
      .all(workspaceId, filter.status) as ApprovalRecord[];
  }
  return db
    .prepare(`SELECT * FROM approvals WHERE workspace_id = ? ORDER BY created_at DESC`)
    .all(workspaceId) as ApprovalRecord[];
}

export function getApproval(
  db: Database.Database,
  workspaceId: string,
  approvalId: string,
): ApprovalRecord | null {
  return (
    (db
      .prepare(`SELECT * FROM approvals WHERE id = ? AND workspace_id = ?`)
      .get(approvalId, workspaceId) as ApprovalRecord | undefined) ?? null
  );
}
