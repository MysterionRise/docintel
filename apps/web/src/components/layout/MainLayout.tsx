import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { OfflineIndicator } from '../shared/OfflineIndicator';
import { InstallPrompt } from '../shared/InstallPrompt';

export function MainLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <OfflineIndicator />
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <InstallPrompt />
    </div>
  );
}
