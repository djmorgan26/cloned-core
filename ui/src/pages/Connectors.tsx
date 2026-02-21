import React, { useState } from 'react';
import { api, type ConnectorEntry } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

function ConnectorRow({ connector, onToggle }: { connector: ConnectorEntry; onToggle: () => void }) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      if (connector.enabled) {
        await api.connectors.disable(connector.id);
      } else {
        await api.connectors.enable(connector.id);
      }
      onToggle();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setToggling(false);
    }
  };

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{connector.id}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>v{connector.version}</div>
      </td>
      <td style={{ color: 'var(--text-muted)' }}>{connector.publisher_id}</td>
      <td>
        <span className={`badge badge-${connector.enabled ? 'success' : 'neutral'}`}>
          {connector.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </td>
      <td>
        {connector.capabilities_provided.map((cap) => (
          <span key={cap} className="badge badge-accent" style={{ marginRight: 4 }}>
            {cap.replace('cap.', '')}
          </span>
        ))}
      </td>
      <td>
        <button
          className={connector.enabled ? 'btn-ghost' : 'btn-primary'}
          onClick={handleToggle}
          disabled={toggling}
          style={{ minWidth: 70 }}
        >
          {toggling ? '...' : connector.enabled ? 'Disable' : 'Enable'}
        </button>
      </td>
    </tr>
  );
}

export function Connectors() {
  const { data, loading, error, refetch } = useApi(() => api.connectors.list());

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--danger)' }}>Error: {error}</div>;

  const connectors = data?.connectors ?? [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Connectors</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{connectors.length} installed</span>
      </div>

      {connectors.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⟨⟩</div>
          <div>No connectors installed</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Run <code>cloned connect github</code> to get started</div>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Connector</th>
                <th>Publisher</th>
                <th>Status</th>
                <th>Capabilities</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((c) => (
                <ConnectorRow key={c.id} connector={c} onToggle={refetch} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
