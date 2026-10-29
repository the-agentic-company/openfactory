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
} from 'lucide-react';
import { domAnimation, LazyMotion, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useId, useState } from 'react';
import { FactoryNavigationItem, type FactoryProject } from './factory-navigation-item';

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
    <LazyMotion features={domAnimation} strict>
      <aside className="sidebar">
        <Link to="/app" className="brand">
          <span className="brand-mark">
            <img src="/openfactory.png" width={28} height={28} alt="" />
          </span>
          OpenFactory
        </Link>
        <nav className="global-navigation" aria-label="Workspace pages">
          <Link
            to="/app"
            className={`nav-link ${activeView === 'overview' ? 'active' : ''}`}
            aria-current={activeView === 'overview' ? 'page' : undefined}
          >
            <ChartNoAxesCombined size={17} />
            Overview
          </Link>
          <Link to="/docs/$" params={{ _splat: '' }} className="nav-link">
            <BookOpen size={17} />
            Documentation
          </Link>
        </nav>
        <div className="project-navigation">
          <div className="nav-label">Factories</div>
          {projects.map((project) => {
            const active = activeProject === project.workspaceRoot;
            const count = agents.filter((agent) => agent.projectId === project.id).length;
            return (
              <FactorySidebarGroup
                key={project.id}
                project={project}
                active={active}
                activeView={activeView}
                count={count}
                onAgentsClick={onAgentsClick}
              />
            );
          })}
          {projects.length === 0 && <p className="muted-copy">No factories available.</p>}
        </div>
        <nav className="settings-navigation" aria-label="Application settings">
          <Link
            to="/app/settings"
            className={`nav-link ${activeView === 'settings' ? 'active' : ''}`}
            aria-current={activeView === 'settings' ? 'page' : undefined}
          >
            <Settings size={17} /> Settings
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
