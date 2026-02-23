-- Cloned v1 SQLite schema (WAL mode recommended)
-- No secrets stored; only references/metadata. Audit is append-only with chain hashes.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Approvals queue (append-only decisions)
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor TEXT, -- requestor identity (may be device or user)
  workspace_id TEXT NOT NULL,
  scope TEXT NOT NULL, -- capability/tool/category scope
  payload_hash TEXT NOT NULL, -- salted hash of request payload
  status TEXT NOT NULL CHECK (status IN ('pending','approved','denied')),
  decided_at TEXT, -- set when approved/denied
  decision_reason TEXT,
  chain_prev_hash TEXT, -- previous record hash for append-only chain
  chain_this_hash TEXT -- current record hash
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_workspace ON approvals(workspace_id);

-- Audit log (append-only). Mirrors SCHEMAS/audit_entry.schema.json with extra chain_this_hash.
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
  costs_json TEXT, -- JSON object of costs
  outcome TEXT NOT NULL CHECK (outcome IN ('success','failure','blocked','dry_run')),
  artifact_manifest_hash TEXT,
  dry_run INTEGER NOT NULL CHECK (dry_run IN (0,1)),
  chain_prev_hash TEXT,
  chain_this_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);

-- Runs (pipelines/jobs)
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

-- Budgets (category caps and rolling window usage)
CREATE TABLE IF NOT EXISTS budgets (
  workspace_id TEXT NOT NULL,
  category TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('hour','day','week','month')),
  cap REAL NOT NULL,
  window_start TEXT NOT NULL,
  used REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, category)
);

-- Pairings (device identities and scopes)
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

-- Connector state (per workspace, no secrets)
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

-- Helper view: pending approvals summary
CREATE VIEW IF NOT EXISTS v_pending_approvals AS
SELECT id, created_at, actor, scope, status FROM approvals WHERE status = 'pending';

-- Note: registry and trust metadata are stored as files per design; DB intentionally
-- excludes secrets and package blobs. All JSON columns must store redacted content only.
