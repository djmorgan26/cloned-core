import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: '◎' },
  { to: '/connectors', label: 'Connectors', icon: '⟨⟩' },
  { to: '/runs', label: 'Runs', icon: '▷' },
  { to: '/approvals', label: 'Approvals', icon: '✓' },
  { to: '/budgets', label: 'Budgets', icon: '$' },
  { to: '/secrets', label: 'Secrets', icon: '⊕' },
  { to: '/pairings', label: 'Devices', icon: '⊗' },
  { to: '/doctor', label: 'Doctor', icon: '♥' },
];

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-w)',
    minHeight: '100vh',
    background: 'var(--bg-card)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
    flexShrink: 0,
  },
  logo: {
    padding: '20px 16px',
    borderBottom: '1px solid var(--border)',
    fontWeight: 700,
    fontSize: 16,
    color: 'var(--text)',
    letterSpacing: '-0.02em',
  },
  logoAccent: { color: 'var(--accent)' },
  nav: { flex: 1, padding: '12px 8px' },
};

export function Sidebar() {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <span style={styles.logoAccent}>⬡</span> Cloned
      </div>
      <nav style={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 'var(--radius)',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              background: isActive ? 'var(--bg-hover)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: 13,
              marginBottom: 2,
              transition: 'all 0.1s',
            })}
          >
            <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)' }}>
        v0.1.0 · Local
      </div>
    </aside>
  );
}
