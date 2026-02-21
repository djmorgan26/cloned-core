import React from 'react';
import { api, type PairingRecord } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

function PairingRow({ pairing, onAction }: { pairing: PairingRecord; onAction: () => void }) {
  const handleApprove = async () => {
    if (!confirm('Approve this device?')) return;
    try {
      await api.pairings.approve(pairing.device_public_key);
      onAction();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke this device?')) return;
    try {
      await api.pairings.revoke(pairing.device_public_key);
      onAction();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{pairing.display_name ?? 'Unknown Device'}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
          {pairing.device_public_key.slice(0, 24)}…
        </div>
      </td>
      <td>
        <span className={`badge badge-${pairing.status === 'approved' ? 'success' : pairing.status === 'revoked' ? 'danger' : 'warning'}`}>
          {pairing.status}
        </span>
      </td>
      <td style={{ color: 'var(--text-muted)' }}>{new Date(pairing.created_at).toLocaleString()}</td>
      <td style={{ color: 'var(--text-muted)' }}>
        {pairing.approved_at ? new Date(pairing.approved_at).toLocaleString() : '—'}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          {pairing.status === 'pending' && (
            <button className="btn-primary" onClick={handleApprove}>Approve</button>
          )}
          {pairing.status !== 'revoked' && (
            <button className="btn-danger" onClick={handleRevoke}>Revoke</button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function Pairings() {
  const { data, loading, error, refetch } = useApi(() => api.pairings.list());

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--danger)' }}>Error: {error}</div>;

  const pairings = data?.pairings ?? [];

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Device Pairings</h1>

      <div className="card">
        {pairings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No devices paired yet
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Approved</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pairings.map((p) => (
                <PairingRow key={p.device_public_key} pairing={p} onAction={refetch} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
