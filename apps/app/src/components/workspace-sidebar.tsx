import { siteUrl } from '../site-url';
import { DesktopUpdate } from './desktop-update';
import type { Agent, WorkspaceView } from '@openfactory/core';
import { Link, useRouterState } from '@tanstack/react-router';
import { BookOpen, ChartNoAxesCombined, Menu, Settings, Store, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { FactoryProject } from './factory-navigation-item';
import { AllFactoriesNavigation, useComputerFactories } from './all-factories';
import { SettingsModal } from './settings-modal';

const mobileQuery = '(max-width: 740px)';
function subscribeMobile(listener: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const readMobile = () => window.matchMedia(mobileQuery).matches;
const serverMobile = () => false;

export function WorkspaceSidebar({
  activeProject = 'all',
  activeView = 'agents',
}: {
  agents: Agent[];
  activeProject?: string;
  activeView?: WorkspaceView | 'teams' | 'overview' | 'settings';
  projects?: FactoryProject[];
  onAgentsClick?: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const factories = useComputerFactories();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, serverMobile);
  const menuId = useId();
  const menu = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useRouterState({ select: (state) => state.location.href });
  function closeMenu() {
    if (menu.current?.matches(':popover-open')) {
      menu.current.hidePopover();
    }
  }
  useEffect(closeMenu, [location]);
  useEffect(() => {
    const element = menu.current;
    function dismissOnNavigation(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest('a[href]')) {
        closeMenu();
      }
    }
    element?.addEventListener('click', dismissOnNavigation);
    return () => element?.removeEventListener('click', dismissOnNavigation);
  }, []);
  return (
    <>
      <aside
        ref={menu}
        id={menuId}
        popover={mobile ? 'auto' : undefined}
        className="sidebar"
        aria-label="Main menu"
        onToggle={(event) => {
          if (event.target === event.currentTarget) {
            setMenuOpen(event.newState === 'open');
          }
        }}
      >
        <div className="sidebar-heading">
          <Link
            to="/app"
            className="brand"
            aria-label="OpenFactory"
            title="OpenFactory"
            onClick={closeMenu}
          >
            <span className="brand-mark">
              <img src="/openfactory.png" width={28} height={28} alt="" />
            </span>
            <span className="sidebar-label">OpenFactory</span>
          </Link>
          <button
            type="button"
            className="mobile-menu-close"
            popoverTarget={menuId}
            popoverTargetAction="hide"
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>
        <nav className="global-navigation" aria-label="Workspace pages">
          <Link
            to="/app"
            activeOptions={{ exact: true }}
            className={`nav-link ${activeView === 'overview' ? 'active' : ''}`}
            aria-current={activeView === 'overview' ? 'page' : undefined}
            aria-label="Overview"
            title="Overview"
            onClick={closeMenu}
          >
            <ChartNoAxesCombined size={17} />
            <span className="sidebar-label">Overview</span>
          </Link>
        </nav>
        <div className="project-navigation">
          <div className="nav-label sidebar-label">Factories</div>
          <AllFactoriesNavigation
            data={factories}
            activeProject={activeProject}
            activeView={activeView}
          />
        </div>
        <nav className="settings-navigation" aria-label="Application settings">
          <DesktopUpdate />
          <div className="sidebar-utilities">
            <a
              href={siteUrl('/marketplace')}
              target="_blank"
              rel="noreferrer"
              className="icon-button"
              aria-label="Marketplace"
              title="Marketplace"
              onClick={closeMenu}
            >
              <Store size={17} />
            </a>
            <a
              href={siteUrl('/docs')}
              target="_blank"
              rel="noreferrer"
              className="icon-button"
              aria-label="Documentation"
              title="Documentation"
              onClick={closeMenu}
            >
              <BookOpen size={17} />
            </a>
            <button
              type="button"
              className="icon-button"
              aria-label="Settings"
              title="Settings"
              onClick={() => {
                closeMenu();
                setSettingsOpen(true);
              }}
            >
              <Settings size={17} />
            </button>
          </div>
        </nav>
      </aside>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <nav className="mobile-navigation" aria-label="Mobile navigation">
        <button
          type="button"
          popoverTarget={menuId}
          aria-controls={menuId}
          aria-expanded={menuOpen}
          className={menuOpen ? 'active' : ''}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
          <span>Menu</span>
        </button>
        <Link
          to="/app"
          activeOptions={{ exact: true }}
          aria-current={activeView === 'overview' ? 'page' : undefined}
        >
          <ChartNoAxesCombined size={22} />
          <span>Overview</span>
        </Link>
        <button type="button" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
          <Settings size={22} />
          <span>Settings</span>
        </button>
      </nav>
    </>
  );
}
