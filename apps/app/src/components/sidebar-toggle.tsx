import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSidebarState } from './sidebar-state';

export function SidebarToggle() {
  const { collapsed, toggleSidebar } = useSidebarState();
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <button
      type="button"
      className="sidebar-collapse-toggle"
      onClick={toggleSidebar}
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
    >
      {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
    </button>
  );
}
