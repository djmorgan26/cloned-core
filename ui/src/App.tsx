import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar.tsx';
import { Overview } from './pages/Overview.tsx';
import { Connectors } from './pages/Connectors.tsx';
import { Approvals } from './pages/Approvals.tsx';
import { Runs } from './pages/Runs.tsx';
import { Budgets } from './pages/Budgets.tsx';
import { Secrets } from './pages/Secrets.tsx';
import { Doctor } from './pages/Doctor.tsx';
import { Pairings } from './pages/Pairings.tsx';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/connectors" element={<Connectors />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/secrets" element={<Secrets />} />
            <Route path="/pairings" element={<Pairings />} />
            <Route path="/doctor" element={<Doctor />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
