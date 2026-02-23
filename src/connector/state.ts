import type Database from 'better-sqlite3';

export interface ConnectorStateRecord {
  workspaceId: string;
  connectorId: string;
  state: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SetConnectorStateOptions {
  /** If true (default), merge new data with existing payload. */
  mergeData?: boolean;
}

/**
 * Persist connector state metadata (no secrets) for a workspace.
 */
export function setConnectorState(
  db: Database.Database,
  workspaceId: string,
  connectorId: string,
  state: string,
  data: Record<string, unknown> = {},
  options?: SetConnectorStateOptions,
): ConnectorStateRecord {
  const existing = getConnectorState(db, workspaceId, connectorId);
  const shouldMerge = options?.mergeData !== false;
  const mergedData = shouldMerge
    ? { ...(existing?.data ?? {}), ...data }
    : { ...data };
  const sanitizedData = sanitizeData(mergedData);
  const now = new Date().toISOString();

  db.prepare(`
      INSERT INTO connector_state (workspace_id, connector_id, state, data_json, created_at, updated_at)
      VALUES (@workspace_id, @connector_id, @state, @data_json, @created_at, @updated_at)
      ON CONFLICT(workspace_id, connector_id)
      DO UPDATE SET
        state = excluded.state,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run({
    workspace_id: workspaceId,
    connector_id: connectorId,
    state,
    data_json: JSON.stringify(sanitizedData),
    created_at: existing?.createdAt ?? now,
    updated_at: now,
  });

  return (getConnectorState(db, workspaceId, connectorId) as ConnectorStateRecord);
}

export function getConnectorState(
  db: Database.Database,
  workspaceId: string,
  connectorId: string,
): ConnectorStateRecord | null {
  const row = db
    .prepare(
      'SELECT workspace_id, connector_id, state, data_json, created_at, updated_at FROM connector_state WHERE workspace_id = ? AND connector_id = ?',
    )
    .get(workspaceId, connectorId) as
    | {
        workspace_id: string;
        connector_id: string;
        state: string;
        data_json: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    connectorId: row.connector_id,
    state: row.state,
    data: safeParse(row.data_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    result[key] = value;
  }
  return result;
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // fallthrough
  }
  return {};
}
