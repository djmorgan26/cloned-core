import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

const STORAGE_KEY = 'cloned:sidebar-collapsed';

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview', icon: '◎' },
  { to: '/connectors', label: 'Connectors', icon: '⟨⟩' },
  { to: '/runs', label: 'Runs', icon: '▷' },
  { to: '/approvals', label: 'Approvals', icon: '✓' },
  { to: '/budgets', label: 'Budgets', icon: '$' },
  { to: '/secrets', label: 'Secrets', icon: '⊕' },
  { to: '/pairings', label: 'Devices', icon: '⊗' },
  { to: '/doctor', label: 'Doctor', icon: '♥' },
  { to: '/docs', label: 'Docs', icon: '📄' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem(STORAGE_KEY) === 'true',
  );

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-logo-icon">⬡</span>
        <span className="sidebar-logo-text">Cloned</span>
        <button
          className="sidebar-toggle"
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className={`sidebar-chevron${collapsed ? ' sidebar-chevron--flipped' : ''}`}>‹</span>
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
            }
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-label">v0.1.0 · Local</span>
      </div>
    </aside>
  );
}
