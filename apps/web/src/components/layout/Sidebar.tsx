import { NavLink } from 'react-router';
import {
  Home,
  FileText,
  HeartPulse,
  DollarSign,
  Scale,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/contracts', label: 'Contracts', icon: FileText },
  { to: '/medical', label: 'Medical', icon: HeartPulse },
  { to: '/financial', label: 'Financial', icon: DollarSign },
  { to: '/legal', label: 'Legal', icon: Scale },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <aside
      className={`flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 ${
        sidebarOpen ? 'w-56' : 'w-16'
      }`}
    >
      <div className="flex items-center justify-between p-4">
        {sidebarOpen && <span className="text-lg font-bold">DocIntel</span>}
        <button
          onClick={toggleSidebar}
          className="rounded p-1 hover:bg-white/10"
        >
          {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon size={20} />
            {sidebarOpen && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
