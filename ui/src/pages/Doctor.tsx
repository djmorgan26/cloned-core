import React from 'react';
import { api, type DoctorCheck } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

function CheckRow({ check }: { check: DoctorCheck }) {
  const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
  const color = check.status === 'pass' ? 'var(--success)' : check.status === 'warn' ? 'var(--warning)' : 'var(--danger)';

  return (
    <tr>
      <td style={{ color, fontWeight: 700, fontSize: 16, width: 28 }}>{icon}</td>
      <td style={{ fontWeight: 500 }}>{check.name}</td>
      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{check.message}</td>
      <td style={{ fontSize: 12, color: 'var(--accent)' }}>{check.fix ?? '—'}</td>
    </tr>
  );
}

export function Doctor() {
  const { data, loading, error, refetch } = useApi(() => api.doctor.run());

  const overallColor = data?.overall === 'pass'
    ? 'var(--success)'
    : data?.overall === 'warn'
    ? 'var(--warning)'
    : 'var(--danger)';

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Environment Doctor</h1>
        <button className="btn-ghost" onClick={refetch} disabled={loading}>
          {loading ? 'Checking...' : 'Re-run checks'}
        </button>
      </div>

      {data && (
        <div className="card" style={{ marginBottom: 16, borderColor: overallColor + '40' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: overallColor }}>
            Overall: {data.overall.toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{data.summary}</div>
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>Error: {error}</div>}

      {data && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Check</th>
                <th>Message</th>
                <th>Fix</th>
              </tr>
            </thead>
            <tbody>
              {data.checks.map((check, i) => (
                <CheckRow key={i} check={check} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
