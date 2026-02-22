const BASE = '/v1';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const resp = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText })) as { error?: string };
    throw new Error(err.error ?? `Request failed: ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export interface WorkspaceInfo {
  workspace_id: string;
  type: string;
  policy_pack: string;
  vault_provider: string;
  version: string;
  created_at: string;
}

export interface ConnectorEntry {
  id: string;
  version: string;
  publisher_id: string;
  enabled: boolean;
  installed_at: string;
  capabilities_provided: string[];
  signature?: string;
}

export interface ApprovalRecord {
  id: string;
  created_at: string;
  actor: string | null;
  workspace_id: string;
  scope: string;
  payload_hash: string;
  status: 'pending' | 'approved' | 'denied';
  decided_at: string | null;
  decision_reason: string | null;
}

export interface RunRecord {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled';
  started_at: string;
  ended_at: string | null;
  created_by: string | null;
  dry_run: number;
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

export interface VaultStatus {
  provider: string;
  healthy: boolean;
  message?: string;
  secret_count: number;
  secrets: VaultSecret[];
}

export interface VaultSecret {
  name: string;
  last_modified?: string;
  value?: string | null;
}

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}

export interface DoctorReport {
  overall: 'pass' | 'fail' | 'warn';
  checks: DoctorCheck[];
  summary: string;
}

export interface PairingRecord {
  device_public_key: string;
  display_name: string | null;
  status: 'pending' | 'approved' | 'revoked';
  requested_scopes_json: string;
  approved_scopes_json: string | null;
  created_at: string;
  approved_at: string | null;
  revoked_at: string | null;
}

export interface DocEntry {
  path: string;
  title: string;
  description?: string;
  audience: string[];
  category: string;
}

async function requestText(path: string): Promise<string> {
  const resp = await fetch(BASE + path);
  if (!resp.ok) throw new Error(`Request failed: ${resp.status}`);
  return resp.text();
}

export const api = {
  docs: {
    list: (audience?: string) =>
      request<{ docs: DocEntry[] }>(`/docs${audience ? `?audience=${encodeURIComponent(audience)}` : ''}`),
    getContent: (path: string) => requestText(`/docs/${path}`),
  },
  workspace: {
    get: () => request<WorkspaceInfo>('/workspace'),
  },
  connectors: {
    list: () => request<{ connectors: ConnectorEntry[] }>('/connectors'),
    enable: (id: string) =>
      request<{ id: string; enabled: boolean }>(`/connectors/${encodeURIComponent(id)}/enable`, { method: 'POST', body: '{}' }),
    disable: (id: string) =>
      request<{ id: string; enabled: boolean }>(`/connectors/${encodeURIComponent(id)}/disable`, { method: 'POST', body: '{}' }),
  },
  approvals: {
    list: (status?: string) =>
      request<{ approvals: ApprovalRecord[] }>(`/approvals${status ? `?status=${status}` : ''}`),
    decide: (id: string, decision: 'approved' | 'denied', reason?: string) =>
      request<ApprovalRecord>(`/approvals/${encodeURIComponent(id)}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason }),
      }),
  },
  runs: {
    list: () => request<{ runs: RunRecord[] }>('/runs'),
    start: (pipeline_id: string, dry_run = false) =>
      request('/runs', { method: 'POST', body: JSON.stringify({ pipeline_id, dry_run }) }),
  },
  budgets: {
    get: () => request<{ budgets: BudgetStatus[] }>('/budgets'),
  },
  vault: {
    status: () => request<VaultStatus>('/vault/status'),
    list: (includeValues = false) =>
      request<{ secrets: VaultSecret[] }>(
        `/vault/secrets${includeValues ? '?include_values=1' : ''}`,
      ),
    get: (name: string) => request<VaultSecret>(`/vault/secrets/${encodeURIComponent(name)}`),
    set: (name: string, value: string) =>
      request<VaultSecret>(`/vault/secrets/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    delete: (name: string) =>
      request<{ deleted: boolean }>(`/vault/secrets/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    export: () => request<{ secrets: Record<string, string> }>('/vault/secrets/export'),
    import: (secrets: Record<string, string>) =>
      request<{ imported: number }>('/vault/secrets/import', {
        method: 'POST',
        body: JSON.stringify({ secrets }),
      }),
  },
  doctor: {
    run: () => request<DoctorReport>('/doctor'),
  },
  pairings: {
    list: () => request<{ pairings: PairingRecord[] }>('/pairings'),
    register: (devicePublicKey: string, displayName: string) =>
      request<{ status: string; device_public_key: string }>('/pairings', {
        method: 'POST',
        body: JSON.stringify({ device_public_key: devicePublicKey, display_name: displayName }),
      }),
    approve: (key: string) =>
      request(`/pairings/${encodeURIComponent(key)}/approve`, { method: 'POST', body: '{}' }),
    revoke: (key: string) =>
      request(`/pairings/${encodeURIComponent(key)}/revoke`, { method: 'POST', body: '{}' }),
  },
};
