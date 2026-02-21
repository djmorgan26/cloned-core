import React from 'react';
import { api } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

function StatCard({ value, label, sub, loading }: {
  value: string | number;
  label: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 140 }}>
      <div className="card-title">{label}</div>
      <div className="stat-value" style={{ color: loading ? 'var(--text-dim)' : undefined }}>
        {loading ? '…' : value}
      </div>
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

  const anyLoading = ws.loading || budgets.loading || connectors.loading || approvals.loading;
  const errors = [ws.error, budgets.error, connectors.error, approvals.error, runs.error].filter(Boolean);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Overview</h1>

      {errors.length > 0 && (
        <div style={{ color: 'var(--danger)', marginBottom: 16, fontSize: 13 }}>
          {errors.map((e, i) => <div key={i}>Error: {e}</div>)}
        </div>
      )}

      {ws.data && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Workspace', value: ws.data.workspace_id },
              { label: 'Tier', value: ws.data.type },
              { label: 'Policy Pack', value: ws.data.policy_pack },
              { label: 'Vault', value: ws.data.vault_provider },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                <div style={{ fontSize: 13, marginTop: 2, textTransform: label === 'Tier' ? 'capitalize' : undefined }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard value={enabledConnectors} label="Active Connectors" loading={connectors.loading} />
        <StatCard value={pendingApprovals} label="Pending Approvals" sub="awaiting decision" loading={approvals.loading} />
        <StatCard value={recentRuns.length} label="Recent Runs" loading={runs.loading} />
        <StatCard value={totalBudgetUsage.toFixed(0)} label="Budget Used" sub="across all categories" loading={budgets.loading} />
      </div>

      {/* Budget mini bars */}
      {budgets.data && budgets.data.budgets.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Budget Usage</div>
          {budgets.data.budgets.map((b) => {
            const pct = Math.min(100, (b.used / b.cap) * 100);
            const color = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--success)';
            return (
              <div key={b.category} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span style={{ fontWeight: 500 }}>{b.category}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {b.used} / {b.cap} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div style={{ height: 4, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!anyLoading && recentRuns.length > 0 && (
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

      {!anyLoading && recentRuns.length === 0 && !runs.error && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>No runs yet</div>
          <div style={{ fontSize: 12 }}>Run <code>cloned run pipeline.research.report --topic "your topic"</code> to get started</div>
        </div>
      )}
    </div>
  );
}
