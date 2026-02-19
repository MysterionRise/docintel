import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { MainLayout } from './components/layout/MainLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ContractsPage } from './pages/ContractsPage';
import { MedicalPage } from './pages/MedicalPage';
import { FinancialPage } from './pages/FinancialPage';
import { LegalPage } from './pages/LegalPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="medical" element={<MedicalPage />} />
          <Route path="financial" element={<FinancialPage />} />
          <Route path="legal" element={<LegalPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
