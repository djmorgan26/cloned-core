import React, { useState } from 'react';
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
          {pairing.device_public_key.slice(0, 32)}…
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

/** Simple deterministic "device ID" from browser metadata. Not a real public key – just a stable identifier. */
function generateBrowserDeviceId(): string {
  const parts = [
    navigator.userAgent.slice(0, 64),
    screen.width,
    screen.height,
    navigator.language,
    new Date().toDateString(),
  ].join('|');
  // Cheap hash – acceptable for a display key (not cryptographic)
  let h = 0;
  for (let i = 0; i < parts.length; i++) {
    h = (Math.imul(31, h) + parts.charCodeAt(i)) | 0;
  }
  return `browser-${Math.abs(h).toString(16).padStart(8, '0')}-${Date.now().toString(36)}`;
}

function RegisterDeviceForm({ onRegistered }: { onRegistered: () => void }) {
  const [name, setName] = useState('My Browser');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const deviceId = generateBrowserDeviceId();
      await api.pairings.register(deviceId, name.trim() || 'My Browser');
      onRegistered();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-title">Register This Device</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Device name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Browser"
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '7px 10px',
              color: 'var(--text)',
              fontSize: 13,
              boxSizing: 'border-box',
            }}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Registering…' : 'Register Device'}
        </button>
      </form>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
        After registering, approve the device from this list to grant API access.
      </div>
    </div>
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

      <RegisterDeviceForm onRegistered={refetch} />

      <div className="card">
        {pairings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No devices paired yet. Register this browser above.
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
