import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { generateId } from '../shared/ids.js';
import { jsonHash } from '../shared/redact.js';

export type AuditOutcome = 'success' | 'failure' | 'blocked' | 'dry_run';
export type PolicyDecision = 'allow' | 'deny' | 'approve_required' | 'dry_run';

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  workspace_id: string;
  tool_id: string | null;
  tool_version: string | null;
  schema_id: string | null;
  input_hash: string;
  policy_decision: PolicyDecision;
  costs_json: string | null;
  outcome: AuditOutcome;
  artifact_manifest_hash: string | null;
  dry_run: boolean;
  chain_prev_hash: string | null;
  chain_this_hash: string | null;
}

export interface AuditEntryInput {
  actor: string;
  workspace_id: string;
  tool_id?: string;
  tool_version?: string;
  schema_id?: string;
  input: unknown;            // will be hashed, not stored raw
  policy_decision: PolicyDecision;
  costs?: Record<string, number>;
  outcome: AuditOutcome;
  artifact_manifest_hash?: string;
  dry_run?: boolean;
}

function getLastAuditHash(db: Database.Database, workspaceId: string): string | null {
  const row = db
    .prepare(
      `SELECT chain_this_hash FROM audit_log WHERE workspace_id = ?
       ORDER BY timestamp DESC LIMIT 1`,
    )
    .get(workspaceId) as { chain_this_hash: string | null } | undefined;
  return row?.chain_this_hash ?? null;
}

function computeEntryHash(prev: string | null, entry: Omit<AuditEntry, 'chain_this_hash'>): string {
  const canonical = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    actor: entry.actor,
    workspace_id: entry.workspace_id,
    tool_id: entry.tool_id,
    tool_version: entry.tool_version,
    input_hash: entry.input_hash,
    policy_decision: entry.policy_decision,
    outcome: entry.outcome,
    dry_run: entry.dry_run,
    chain_prev_hash: prev,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function appendAuditEntry(
  db: Database.Database,
  auditLogPath: string,
  input: AuditEntryInput,
): AuditEntry {
  const id = generateId();
  const timestamp = new Date().toISOString();
  const chain_prev_hash = getLastAuditHash(db, input.workspace_id);

  const input_hash = jsonHash(input.input);
  const costs_json = input.costs ? JSON.stringify(input.costs) : null;

  const partial: Omit<AuditEntry, 'chain_this_hash'> = {
    id,
    timestamp,
    actor: input.actor,
    workspace_id: input.workspace_id,
    tool_id: input.tool_id ?? null,
    tool_version: input.tool_version ?? null,
    schema_id: input.schema_id ?? null,
    input_hash,
    policy_decision: input.policy_decision,
    costs_json,
    outcome: input.outcome,
    artifact_manifest_hash: input.artifact_manifest_hash ?? null,
    dry_run: input.dry_run ?? false,
    chain_prev_hash,
  };

  const chain_this_hash = computeEntryHash(chain_prev_hash, partial);
  const entry: AuditEntry = { ...partial, chain_this_hash };

  // Write to SQLite
  db.prepare(`
    INSERT INTO audit_log
      (id, timestamp, actor, workspace_id, tool_id, tool_version, schema_id,
       input_hash, policy_decision, costs_json, outcome, artifact_manifest_hash,
       dry_run, chain_prev_hash, chain_this_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.timestamp,
    entry.actor,
    entry.workspace_id,
    entry.tool_id,
    entry.tool_version,
    entry.schema_id,
    entry.input_hash,
    entry.policy_decision,
    entry.costs_json,
    entry.outcome,
    entry.artifact_manifest_hash,
    entry.dry_run ? 1 : 0,
    entry.chain_prev_hash,
    entry.chain_this_hash,
  );

  // Also append to line-delimited JSON log file
  try {
    appendFileSync(auditLogPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // Non-fatal: DB is the source of truth
  }

  return entry;
}

export function listAuditLog(
  db: Database.Database,
  workspaceId: string,
  limit = 100,
  offset = 0,
): AuditEntry[] {
  return db
    .prepare(
      `SELECT * FROM audit_log WHERE workspace_id = ?
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(workspaceId, limit, offset) as AuditEntry[];
}
