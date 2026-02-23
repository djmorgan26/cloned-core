import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to SQL schema relative to this file's compiled location
const SCHEMA_SQL = join(__dirname, '../../state/sqlite_schema.sql');

let _db: Database.Database | null = null;

export function openDb(dbPath: string): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Apply schema
  try {
    const sql = readFileSync(SCHEMA_SQL, 'utf8');
    _db.exec(sql);
  } catch (err) {
    // Schema file may not be available in all contexts; apply inline fallback
    applyInlineSchema(_db);
  }

  return _db;
}

export function applyInlineSchema(db: Database.Database): void {
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
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_approvals_workspace ON approvals(workspace_id);

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

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      pipeline_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed','canceled')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_by TEXT,
      dry_run INTEGER NOT NULL CHECK (dry_run IN (0,1))
    );
    CREATE INDEX IF NOT EXISTS idx_runs_workspace ON runs(workspace_id);

    CREATE TABLE IF NOT EXISTS budgets (
      workspace_id TEXT NOT NULL,
      category TEXT NOT NULL,
      period TEXT NOT NULL CHECK (period IN ('hour','day','week','month')),
      cap REAL NOT NULL,
      window_start TEXT NOT NULL,
      used REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (workspace_id, category)
    );

    CREATE TABLE IF NOT EXISTS pairings (
      device_public_key TEXT PRIMARY KEY,
      display_name TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending','approved','revoked')),
      requested_scopes_json TEXT NOT NULL,
      approved_scopes_json TEXT,
      created_at TEXT NOT NULL,
      approved_at TEXT,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pairings_status ON pairings(status);

    CREATE TABLE IF NOT EXISTS connector_state (
      workspace_id TEXT NOT NULL,
      connector_id TEXT NOT NULL,
      state TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, connector_id)
    );
    CREATE INDEX IF NOT EXISTS idx_connector_state_workspace ON connector_state(workspace_id);

    CREATE VIEW IF NOT EXISTS v_pending_approvals AS
    SELECT id, created_at, actor, scope, status FROM approvals WHERE status = 'pending';
  `);
}

export function getDb(): Database.Database {
  if (!_db) throw new Error('Database not opened. Call openDb() first.');
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function _resetDb(): void {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
    _db = null;
  }
}
