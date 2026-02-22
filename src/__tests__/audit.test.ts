import { describe, it, expect, beforeEach } from '@jest/globals';
import type Database from 'better-sqlite3';
import MemoryDatabase from './memory-db.js';
import { appendAuditEntry, listAuditLog } from '../audit/audit.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

function createTestDb(): Database.Database {
  const db = new MemoryDatabase(':memory:') as unknown as Database.Database;
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      tool_id TEXT,
      tool_version TEXT,
      schema_id TEXT,
      input_hash TEXT NOT NULL,
      policy_decision TEXT NOT NULL,
      costs_json TEXT,
      outcome TEXT NOT NULL CHECK (outcome IN ('success','failure','blocked','dry_run')),
      artifact_manifest_hash TEXT,
      dry_run INTEGER NOT NULL CHECK (dry_run IN (0,1)),
      chain_prev_hash TEXT,
      chain_this_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_log(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
  `);
  return db;
}

describe('Audit Log', () => {
  let db: Database.Database;
  let auditLogPath: string;

  beforeEach(() => {
    db = createTestDb();
    const tmpDir = mkdtempSync(join(tmpdir(), 'cloned-test-'));
    auditLogPath = join(tmpDir, 'audit.log');
  });

  it('appends audit entries with chain hashes', () => {
    const entry = appendAuditEntry(db, auditLogPath, {
      actor: 'cli',
      workspace_id: 'ws1',
      tool_id: 'tool.test@v1',
      input: { test: true },
      policy_decision: 'allow',
      outcome: 'success',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.chain_this_hash).toBeTruthy();
    expect(entry.chain_prev_hash).toBeNull();
    expect(entry.input_hash).toHaveLength(64);
  });

  it('chains entries via hashes', () => {
    const e1 = appendAuditEntry(db, auditLogPath, {
      actor: 'cli',
      workspace_id: 'ws1',
      input: { a: 1 },
      policy_decision: 'allow',
      outcome: 'success',
    });

    const e2 = appendAuditEntry(db, auditLogPath, {
      actor: 'cli',
      workspace_id: 'ws1',
      input: { b: 2 },
      policy_decision: 'allow',
      outcome: 'success',
    });

    expect(e2.chain_prev_hash).toBe(e1.chain_this_hash);
    expect(e2.chain_this_hash).not.toBe(e1.chain_this_hash);
  });

  it('never stores raw input – only hash', () => {
    const sensitiveInput = { password: 'topsecret123' };
    const entry = appendAuditEntry(db, auditLogPath, {
      actor: 'cli',
      workspace_id: 'ws1',
      input: sensitiveInput,
      policy_decision: 'allow',
      outcome: 'success',
    });

    // The DB row should not contain the raw password
    const row = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(entry.id) as Record<string, string>;
    const rowStr = JSON.stringify(row);
    expect(rowStr).not.toContain('topsecret123');
    expect(entry.input_hash).toHaveLength(64);
  });

  it('lists audit log entries', () => {
    appendAuditEntry(db, auditLogPath, {
      actor: 'cli',
      workspace_id: 'ws1',
      input: { x: 1 },
      policy_decision: 'allow',
      outcome: 'success',
    });
    appendAuditEntry(db, auditLogPath, {
      actor: 'cli',
      workspace_id: 'ws1',
      input: { x: 2 },
      policy_decision: 'deny',
      outcome: 'blocked',
    });

    const entries = listAuditLog(db, 'ws1');
    expect(entries.length).toBe(2);
  });
});
