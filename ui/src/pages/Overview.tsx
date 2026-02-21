import React from 'react';
import { api } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

function StatCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-title">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-label">{sub}</div>}
    </div>
  );
}

export function Overview() {
  const ws = useApi(() => api.workspace.get());
  const budgets = useApi(() => api.budgets.get());
  const connectors = useApi(() => api.connectors.list());
  const approvals = useApi(() => api.approvals.list('pending'));
  const runs = useApi(() => api.runs.list());

  const totalBudgetUsage = budgets.data?.budgets.reduce((sum, b) => sum + b.used, 0) ?? 0;
  const enabledConnectors = connectors.data?.connectors.filter((c) => c.enabled).length ?? 0;
  const pendingApprovals = approvals.data?.approvals.length ?? 0;
  const recentRuns = runs.data?.runs.slice(0, 5) ?? [];

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Overview</h1>

      {ws.data && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Workspace</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{ws.data.workspace_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tier</div>
              <div style={{ fontSize: 13, marginTop: 2, textTransform: 'capitalize' }}>{ws.data.type}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Policy Pack</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{ws.data.policy_pack}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Vault</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{ws.data.vault_provider}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard value={enabledConnectors} label="Active Connectors" />
        <StatCard value={pendingApprovals} label="Pending Approvals" sub="awaiting decision" />
        <StatCard value={recentRuns.length} label="Recent Runs" />
        <StatCard value={totalBudgetUsage.toFixed(0)} label="Total Budget Used" sub="across all categories" />
      </div>

      {recentRuns.length > 0 && (
        <div className="card">
          <div className="card-title">Recent Runs</div>
          <table className="table">
            <thead>
              <tr>
                <th>Pipeline</th>
                <th>Status</th>
                <th>Started</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{run.pipeline_id}</td>
                  <td>
                    <span className={`badge badge-${run.status === 'succeeded' ? 'success' : run.status === 'failed' ? 'danger' : 'neutral'}`}>
                      {run.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(run.started_at).toLocaleString()}</td>
                  <td>{run.dry_run ? <span className="badge badge-accent">Dry Run</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
