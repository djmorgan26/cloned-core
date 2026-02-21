import React from 'react';
import { api } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

export function Secrets() {
  const { data, loading, error } = useApi(() => api.vault.status());

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--danger)' }}>Error: {error}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Secrets</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Provider</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{data?.provider ?? '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Status</div>
            <span className={`badge badge-${data?.healthy ? 'success' : 'danger'}`} style={{ marginTop: 6, display: 'inline-flex' }}>
              {data?.healthy ? 'Healthy' : 'Unhealthy'}
            </span>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Secrets Count</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{data?.secret_count ?? 0}</div>
          </div>
        </div>
        {data?.message && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--warning)', padding: '8px 12px', background: 'rgba(245,158,11,.08)', borderRadius: 6 }}>
            ⚠ {data.message}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Secret References (names only – values never shown)</div>
        {(data?.secrets ?? []).length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No secrets stored</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Last Modified</th>
              </tr>
            </thead>
            <tbody>
              {(data?.secrets ?? []).map((s) => (
                <tr key={s.name}>
                  <td className="mono">{s.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {s.last_modified ? new Date(s.last_modified).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 16, padding: 12, background: 'rgba(99,102,241,.06)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', border: '1px solid rgba(99,102,241,.2)' }}>
        ⊕ Secret values are never displayed in the UI. Use <code>cloned vault status</code> from the CLI to manage secrets.
      </div>
    </div>
  );
}
