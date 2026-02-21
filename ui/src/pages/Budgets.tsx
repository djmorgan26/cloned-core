import React from 'react';
import { api, type BudgetStatus } from '../api/client.ts';
import { useApi } from '../hooks/useApi.ts';

function BudgetBar({ budget }: { budget: BudgetStatus }) {
  const pct = Math.min(100, (budget.used / budget.cap) * 100);
  const color = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--success)';

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <span style={{ fontWeight: 600 }}>{budget.category}</span>
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            per {budget.period}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {budget.used.toFixed(0)} / {budget.cap.toFixed(0)}
          <span style={{ marginLeft: 6, color }}>({pct.toFixed(0)}%)</span>
        </div>
      </div>
      <div style={{ height: 6, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          Window start: {new Date(budget.window_start).toLocaleDateString()}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          Remaining: {budget.remaining.toFixed(0)}
        </div>
      </div>
    </div>
  );
}

export function Budgets() {
  const { data, loading, error } = useApi(() => api.budgets.get());

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--danger)' }}>Error: {error}</div>;

  const budgets = data?.budgets ?? [];

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Budgets</h1>

      {budgets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No budgets configured
        </div>
      ) : (
        <div className="card">
          {budgets.map((b) => (
            <BudgetBar key={b.category} budget={b} />
          ))}
        </div>
      )}
    </div>
  );
}
