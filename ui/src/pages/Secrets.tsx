import React, { useMemo, useState } from 'react';
import { api, type VaultSecret } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

export function Secrets() {
  const {
    data: statusData,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useApi(() => api.vault.status());
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [formName, setFormName] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [rowLoading, setRowLoading] = useState<string | null>(null);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const secrets = useMemo(() => {
    return [...(statusData?.secrets ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [statusData]);

  if (!statusData && statusLoading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading secrets...</div>;
  }

  if (!statusData && statusError) {
    return <div style={{ padding: 24, color: 'var(--danger)' }}>Error: {statusError}</div>;
  }

  if (!statusData) {
    return <div style={{ padding: 24, color: 'var(--danger)' }}>Unable to load secrets.</div>;
  }

  const refresh = () => {
    refetchStatus();
  };

  const toggleReveal = async (secret: VaultSecret) => {
    if (revealed[secret.name]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[secret.name];
        return next;
      });
      return;
    }
    if (secretValues[secret.name] !== undefined) {
      setRevealed((prev) => ({ ...prev, [secret.name]: true }));
      return;
    }
    setRowLoading(secret.name);
    try {
      const full = await api.vault.get(secret.name);
      setSecretValues((prev) => ({ ...prev, [secret.name]: full.value ?? '' }));
      setRevealed((prev) => ({ ...prev, [secret.name]: true }));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRowLoading(null);
    }
  };

  const beginCreate = () => {
    setFormMode('create');
    setFormName('');
    setFormValue('');
  };

  const beginEdit = async (secret: VaultSecret) => {
    setRowLoading(secret.name);
    try {
      const full = await api.vault.get(secret.name);
      const value = full.value ?? '';
      setSecretValues((prev) => ({ ...prev, [secret.name]: value }));
      setRevealed((prev) => ({ ...prev, [secret.name]: true }));
      setFormMode('edit');
      setFormName(secret.name);
      setFormValue(value);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRowLoading(null);
    }
  };

  const saveSecret = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formName.trim()) {
      alert('Secret name is required');
      return;
    }
    setFormSaving(true);
    try {
      await api.vault.set(formName.trim(), formValue);
      setSecretValues((prev) => ({ ...prev, [formName.trim()]: formValue }));
      setRevealed((prev) => ({ ...prev, [formName.trim()]: true }));
      setFormMode(null);
      setFormName('');
      setFormValue('');
      refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setFormSaving(false);
    }
  };

  const deleteSecret = async (name: string) => {
    if (!confirm(`Delete secret "${name}"?`)) return;
    setRowLoading(name);
    try {
      await api.vault.delete(name);
      setSecretValues((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRowLoading(null);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      alert('Paste JSON secrets to import.');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      alert('Invalid JSON payload');
      return;
    }

    let toUpload: Record<string, string> = {};
    if (Array.isArray(parsed)) {
      parsed.forEach((entry) => {
        if (
          entry &&
          typeof entry === 'object' &&
          'name' in entry &&
          'value' in entry &&
          typeof (entry as { name: unknown }).name === 'string' &&
          typeof (entry as { value: unknown }).value === 'string'
        ) {
          toUpload[(entry as { name: string; value: string }).name] = (entry as {
            name: string;
            value: string;
          }).value;
        }
      });
    } else if (parsed && typeof parsed === 'object') {
      Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof value === 'string') {
          toUpload[key] = value;
        }
      });
    }

    if (Object.keys(toUpload).length === 0) {
      alert('Provide at least one secret with string values.');
      return;
    }

    setImporting(true);
    try {
      await api.vault.import(toUpload);
      setSecretValues((prev) => ({ ...prev, ...toUpload }));
      setRevealed((prev) => {
        const next = { ...prev };
        Object.keys(toUpload).forEach((key) => {
          next[key] = true;
        });
        return next;
      });
      setImportText('');
      setImportOpen(false);
      refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = await api.vault.export();
      const blob = new Blob([JSON.stringify(payload.secrets, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'cloned-vault-export.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const cancelForm = () => {
    setFormMode(null);
    setFormName('');
    setFormValue('');
  };

  const renderValue = (secret: VaultSecret) => {
    if (!revealed[secret.name]) return '••••••••';
    const value = secretValues[secret.name] ?? '';
    if (value === '') {
      return <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>empty</span>;
    }
    return value;
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Secrets</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={beginCreate}>Add Secret</button>
          <button className="btn-ghost" onClick={() => setImportOpen((open) => !open)}>
            {importOpen ? 'Close Import' : 'Import JSON'}
          </button>
          <button className="btn-ghost" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export JSON'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div className="stat-label">Provider</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{statusData.provider}</div>
          </div>
          <div>
            <div className="stat-label">Status</div>
            <span className={`badge badge-${statusData.healthy ? 'success' : 'danger'}`} style={{ marginTop: 6, display: 'inline-flex' }}>
              {statusData.healthy ? 'Healthy' : 'Unhealthy'}
            </span>
          </div>
          <div>
            <div className="stat-label">Secrets Count</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{statusData.secret_count}</div>
          </div>
        </div>
        {statusData.message && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--warning)', padding: '8px 12px', background: 'rgba(245,158,11,.08)', borderRadius: 6 }}>
            ⚠ {statusData.message}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Stored Secrets</div>
        </div>
        {statusLoading && <div style={{ color: 'var(--text-muted)' }}>Refreshing secrets…</div>}
        {secrets.length === 0 && !statusLoading ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No secrets stored yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Last Modified</th>
                <th>Value</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {secrets.map((secret) => (
                <tr key={secret.name}>
                  <td className="mono">{secret.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {secret.last_modified ? new Date(secret.last_modified).toLocaleString() : '—'}
                  </td>
                  <td className="mono">{renderValue(secret)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn-ghost"
                        onClick={() => toggleReveal(secret)}
                        disabled={rowLoading === secret.name}
                      >
                        {revealed[secret.name] ? 'Hide' : 'Show'}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => beginEdit(secret)}
                        disabled={rowLoading === secret.name}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => deleteSecret(secret.name)}
                        disabled={rowLoading === secret.name}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formMode && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>
            {formMode === 'create' ? 'Add Secret' : `Edit ${formName}`}
          </div>
          <form onSubmit={saveSecret} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Name</span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={formMode === 'edit'}
                autoComplete="off"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Value</span>
              <textarea
                rows={4}
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                autoComplete="off"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" type="submit" disabled={formSaving}>
                {formSaving ? 'Saving…' : 'Save Secret'}
              </button>
              <button type="button" className="btn-ghost" onClick={cancelForm} disabled={formSaving}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {importOpen && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Import Secrets</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Paste a JSON object (<code>{"{\"key\":\"value\"}"}</code>) or array of objects with{' '}
            <code>name</code> and <code>value</code> fields. Existing secrets with the same name are
            overwritten.
          </p>
          <textarea
            rows={6}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '10px',
              color: 'var(--text)',
              fontFamily: 'monospace',
              marginBottom: 12,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import Secrets'}
            </button>
            <button className="btn-ghost" onClick={() => setImportOpen(false)} disabled={importing}>
              Close
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, padding: 12, background: 'rgba(147,197,253,.07)', borderRadius: 8, border: '1px solid rgba(147,197,253,.2)', fontSize: 12, color: 'var(--text-muted)' }}>
        ✅ Secrets live in your local workspace vault. Revealed values stay on this device only—copy carefully.
      </div>
    </div>
  );
}
