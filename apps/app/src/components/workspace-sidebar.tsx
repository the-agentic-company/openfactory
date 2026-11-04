import { siteUrl } from '../site-url';
import { DesktopUpdate } from './desktop-update';
import { projectName } from '../project-path';
import type { Agent, WorkspaceView } from '@openfactory/core';
import { Link } from '@tanstack/react-router';
import {
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  FileCode2,
  GitPullRequest,
  ListVideo,
  Network,
  ScanLine,
  Settings,
  Store,
} from 'lucide-react';
import { domMax, LazyMotion, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useId, useState } from 'react';
import { FactoryNavigationItem, type FactoryProject } from './factory-navigation-item';
import { AppearanceGlyph } from './appearance-glyph';
import { useSidebarState } from './sidebar-state';
import { SidebarToggle } from './sidebar-toggle';
import { useSidebarMotion } from './sidebar-motion';

const navigation = [
  { view: 'dashboard', label: 'Dashboard', icon: ChartNoAxesCombined },
  { view: 'teams', label: 'Teams', icon: Network },
  { view: 'agents', label: 'Agents', icon: Bot },
  { view: 'runs', label: 'Runs', icon: ListVideo },
  { view: 'pull-requests', label: 'Pull requests', icon: GitPullRequest },
  { view: 'scorers', label: 'Scorers', icon: ScanLine },
  { view: 'definition', label: 'Factory definition', icon: FileCode2 },
] satisfies { view: WorkspaceView | 'teams'; label: string; icon: typeof ChartNoAxesCombined }[];
export function WorkspaceSidebar({
  agents,
  activeProject = 'all',
  activeView = 'agents',
  projects: suppliedProjects,
  onAgentsClick,
}: {
  agents: Agent[];
  activeProject?: string;
  activeView?: WorkspaceView | 'teams' | 'overview' | 'settings';
  projects?: FactoryProject[];
  onAgentsClick?: () => void;
}) {
  const { collapsed } = useSidebarState();
  useSidebarMotion(collapsed);
  const reduceMotion = useReducedMotion();
  const projects: FactoryProject[] = suppliedProjects ?? [
    ...new Map(
      agents.map((agent) => [
        agent.projectId,
        {
          id: agent.projectId,
          title: agent.projectName,
          workspaceRoot: agent.projectPath ?? agent.projectId,
        },
      ]),
    ).values(),
  ];
  return (
    <LazyMotion features={domMax} strict>
      <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
        <div className="sidebar-heading">
          <Link to="/app" className="brand" aria-label="OpenFactory" title="OpenFactory">
            <span className="brand-mark">
              <img src="/openfactory.png" width={28} height={28} alt="" />
            </span>
            <span className="sidebar-label">OpenFactory</span>
          </Link>
        </div>
        <nav className="global-navigation" aria-label="Workspace pages">
          <Link
            to="/app"
            activeOptions={{ exact: true }}
            className={`nav-link ${activeView === 'overview' ? 'active' : ''}`}
            aria-current={activeView === 'overview' ? 'page' : undefined}
            aria-label="Overview"
            title="Overview"
          >
            <ChartNoAxesCombined size={17} />
            <span className="sidebar-label">Overview</span>
          </Link>
          <a
            href={siteUrl('/marketplace')}
            target="_blank"
            rel="noreferrer"
            className="nav-link"
            aria-label="Marketplace"
            title="Marketplace"
          >
            <Store size={17} /> <span className="sidebar-label">Marketplace</span>
          </a>
          <a
            href={siteUrl('/docs')}
            target="_blank"
            rel="noreferrer"
            className="nav-link"
            aria-label="Documentation"
            title="Documentation"
          >
            <BookOpen size={17} />
            <span className="sidebar-label">Documentation</span>
          </a>
        </nav>
        <div className="project-navigation">
          <div className="nav-label sidebar-label">Factories</div>
          {projects.map((project) => {
            const active = activeProject === project.workspaceRoot;
            const count = agents.filter((agent) => agent.projectId === project.id).length;
            return (
              <m.div
                key={project.id}
                className="sidebar-factory"
                layout={reduceMotion ? false : 'position'}
                transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
              >
                <m.div
                  initial={false}
                  animate={{ opacity: collapsed ? 1 : 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
                  className="sidebar-factory-content sidebar-factory-rail"
                  inert={!collapsed}
                  aria-hidden={!collapsed}
                >
                  <Link
                    to="/app/projects/$project/$view"
                    params={{ project: projectName(project.workspaceRoot), view: 'agents' }}
                    className={`nav-link factory-rail-link ${active ? 'active' : ''}`}
                    aria-label={`${project.title} agents`}
                    title={project.title}
                    onClick={onAgentsClick}
                  >
                    <AppearanceGlyph
                      appearance={project.icon ?? { kind: 'icon', name: 'factory', color: 'gray' }}
                      size={17}
                    />
                  </Link>
                </m.div>
                <m.div
                  initial={false}
                  animate={{ opacity: collapsed ? 0 : 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
                  className="sidebar-factory-content sidebar-factory-expanded"
                  inert={collapsed}
                  aria-hidden={collapsed}
                >
                  <FactorySidebarGroup
                    project={project}
                    active={active}
                    activeView={activeView}
                    count={count}
                    onAgentsClick={onAgentsClick}
                  />
                </m.div>
              </m.div>
            );
          })}
          {projects.length === 0 && (
            <p className="muted-copy sidebar-label">No factories available.</p>
          )}
        </div>
        <nav className="settings-navigation" aria-label="Application settings">
          <DesktopUpdate />
          <SidebarToggle />
          <Link
            to="/app/settings"
            className={`nav-link ${activeView === 'settings' ? 'active' : ''}`}
            aria-current={activeView === 'settings' ? 'page' : undefined}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={17} /> <span className="sidebar-label">Settings</span>
          </Link>
        </nav>
      </aside>
    </LazyMotion>
  );
}

function FactorySidebarGroup({
  project,
  active,
  activeView,
  count,
  onAgentsClick,
}: {
  project: FactoryProject;
  active: boolean;
  activeView: WorkspaceView | 'teams' | 'overview' | 'settings';
  count: number;
  onAgentsClick?: () => void;
}) {
  const contentId = useId();
  const reduceMotion = useReducedMotion();
  const [disclosure, setDisclosure] = useState({ active, open: active });
  if (disclosure.active !== active) {
    setDisclosure({ active, open: active });
  }
  const { open } = disclosure;
  const duration = reduceMotion ? 0 : open ? 0.22 : 0.16;

  return (
    <div className="factory-nav-group">
      <FactoryNavigationItem project={project}>
        <button
          type="button"
          className="factory-nav-toggle"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setDisclosure({ active, open: !open })}
        >
          <span className="factory-name" title={project.workspaceRoot}>
            {project.title}
          </span>
        </button>
      </FactoryNavigationItem>
      <m.div
        id={contentId}
        className="factory-nav-content"
        inert={!open}
        aria-hidden={!open}
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration, ease: 'easeOut' }}
      >
        <nav aria-label={`${project.title} pages`} className="factory-navigation">
          {navigation.map(({ view, label, icon: Icon }) =>
            view === 'teams' ? (
              <Link
                key={view}
                to="/app/projects/$project/teams/{-$section}"
                params={{ project: projectName(project.workspaceRoot), section: undefined }}
                className={`nav-link ${active && activeView === 'teams' ? 'active' : ''}`}
                aria-current={active && activeView === 'teams' ? 'page' : undefined}
              >
                <Network size={17} />
                Teams
              </Link>
            ) : (
              <Link
                key={view}
                className={`nav-link ${active && activeView === view ? 'active' : ''}`}
                to="/app/projects/$project/$view"
                params={{ project: projectName(project.workspaceRoot), view }}
                onClick={view === 'agents' ? onAgentsClick : undefined}
                aria-current={active && activeView === view ? 'page' : undefined}
              >
                <Icon size={17} />
                {label}
                {view === 'agents' && <span className="nav-count">{count}</span>}
              </Link>
            ),
          )}
        </nav>
      </m.div>
    </div>
  );
}
