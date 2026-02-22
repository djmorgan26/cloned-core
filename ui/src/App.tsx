import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar.tsx';
import { Landing } from './pages/Landing.tsx';
import { Overview } from './pages/Overview.tsx';
import { Connectors } from './pages/Connectors.tsx';
import { Approvals } from './pages/Approvals.tsx';
import { Runs } from './pages/Runs.tsx';
import { Budgets } from './pages/Budgets.tsx';
import { Secrets } from './pages/Secrets.tsx';
import { Doctor } from './pages/Doctor.tsx';
import { Pairings } from './pages/Pairings.tsx';
import { Docs } from './pages/Docs.tsx';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/overview" element={<AppLayout><Overview /></AppLayout>} />
        <Route path="/connectors" element={<AppLayout><Connectors /></AppLayout>} />
        <Route path="/approvals" element={<AppLayout><Approvals /></AppLayout>} />
        <Route path="/runs" element={<AppLayout><Runs /></AppLayout>} />
        <Route path="/budgets" element={<AppLayout><Budgets /></AppLayout>} />
        <Route path="/secrets" element={<AppLayout><Secrets /></AppLayout>} />
        <Route path="/pairings" element={<AppLayout><Pairings /></AppLayout>} />
        <Route path="/doctor" element={<AppLayout><Doctor /></AppLayout>} />
        <Route path="/docs" element={<AppLayout><Docs /></AppLayout>} />
      </Routes>
    </BrowserRouter>
  );
}
