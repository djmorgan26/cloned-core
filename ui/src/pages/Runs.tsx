import React, { useState } from 'react';
import { api, type RunRecord } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

const PIPELINES = [
  { id: 'pipeline.research.report', label: 'Research Report' },
  { id: 'pipeline.builder.scaffold', label: 'App/Repo Scaffold' },
  { id: 'pipeline.creator.youtube', label: 'YouTube Creator' },
];

function statusBadge(status: RunRecord['status']) {
  const map: Record<string, string> = {
    succeeded: 'success',
    failed: 'danger',
    running: 'accent',
    pending: 'warning',
    canceled: 'neutral',
  };
  return <span className={`badge badge-${map[status] ?? 'neutral'}`}>{status}</span>;
}

export function Runs() {
  const { data, loading, error, refetch } = useApi(() => api.runs.list());
  const [starting, setStarting] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState(PIPELINES[0].id);
  const [dryRun, setDryRun] = useState(false);

  const handleStart = async () => {
    if (!confirm(`Start pipeline: ${selectedPipeline}?`)) return;
    setStarting(true);
    try {
      await api.runs.start(selectedPipeline, dryRun);
      refetch();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Runs</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Start Pipeline</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedPipeline}
            onChange={(e) => setSelectedPipeline(e.target.value)}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '6px 10px',
              color: 'var(--text)',
              fontSize: 13,
            }}
          >
            {PIPELINES.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run
          </label>
          <button className="btn-primary" onClick={handleStart} disabled={starting}>
            {starting ? 'Starting...' : 'Start Run'}
          </button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)' }}>Loading...</div>}
      {error && <div style={{ color: 'var(--danger)' }}>Error: {error}</div>}

      {!loading && !error && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Pipeline</th>
                <th>Status</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {(data?.runs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    No runs yet
                  </td>
                </tr>
              ) : (
                (data?.runs ?? []).map((run) => (
                  <tr key={run.id}>
                    <td className="mono" style={{ fontSize: 11 }}>{run.id.slice(0, 12)}…</td>
                    <td className="mono" style={{ fontSize: 12 }}>{run.pipeline_id}</td>
                    <td>{statusBadge(run.status)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{new Date(run.started_at).toLocaleString()}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {run.ended_at ? new Date(run.ended_at).toLocaleString() : '—'}
                    </td>
                    <td>{run.dry_run ? <span className="badge badge-accent">Dry</span> : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
