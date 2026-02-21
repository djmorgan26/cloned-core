import React, { useState } from 'react';
import { api, type ApprovalRecord } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

function ApprovalCard({ approval, onDecide }: { approval: ApprovalRecord; onDecide: () => void }) {
  const [deciding, setDeciding] = useState(false);
  const [reason, setReason] = useState('');

  const decide = async (decision: 'approved' | 'denied') => {
    if (!confirm(`${decision === 'approved' ? 'Approve' : 'Deny'} this request?`)) return;
    setDeciding(true);
    try {
      await api.approvals.decide(approval.id, decision, reason || undefined);
      onDecide();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeciding(false);
    }
  };

  const isPending = approval.status === 'pending';

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{approval.scope}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            ID: {approval.id} · {new Date(approval.created_at).toLocaleString()}
          </div>
        </div>
        <span className={`badge badge-${approval.status === 'approved' ? 'success' : approval.status === 'denied' ? 'danger' : 'warning'}`}>
          {approval.status}
        </span>
      </div>

      {approval.actor && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          Requested by: {approval.actor}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 12 }}>
        Payload hash: {approval.payload_hash.slice(0, 16)}...
      </div>

      {approval.decision_reason && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Decision: {approval.decision_reason}
        </div>
      )}

      {isPending && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '6px 10px',
              color: 'var(--text)',
              fontSize: 12,
            }}
          />
          <button className="btn-primary" onClick={() => decide('approved')} disabled={deciding}>
            Approve
          </button>
          <button className="btn-danger" onClick={() => decide('denied')} disabled={deciding}>
            Deny
          </button>
        </div>
      )}
    </div>
  );
}

export function Approvals() {
  const [filter, setFilter] = useState<string>('');
  const { data, loading, error, refetch } = useApi(() =>
    api.approvals.list(filter || undefined),
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Approvals</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['', 'pending', 'approved', 'denied'] as const).map((s) => (
            <button
              key={s}
              className={filter === s ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setFilter(s)}
              style={{ minWidth: 70 }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)' }}>Loading...</div>}
      {error && <div style={{ color: 'var(--danger)' }}>Error: {error}</div>}

      {!loading && !error && (data?.approvals ?? []).length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No approvals found
        </div>
      )}

      {(data?.approvals ?? []).map((approval) => (
        <ApprovalCard key={approval.id} approval={approval} onDecide={refetch} />
      ))}
    </div>
  );
}
