import type { Agent, WorkspaceView } from '@openfactory/core';
import { Link } from '@tanstack/react-router';
import {
  BookOpen,
  ChartNoAxesCombined,
  FileCode2,
  Grid2X2,
  GitPullRequest,
  ListVideo,
  Network,
  ScanLine,
} from 'lucide-react';
import { FactoryNavigationItem, type FactoryProject } from './factory-navigation-item';
import { AppearanceGlyph } from './appearance-glyph';

const navigation = [
  { view: 'dashboard', label: 'Dashboard', icon: ChartNoAxesCombined },
  { view: 'teams', label: 'Teams', icon: Network },
  { view: 'agents', label: 'Agents', icon: Grid2X2 },
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
  activeView?: WorkspaceView | 'teams' | 'overview';
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
    <aside className="sidebar">
      <Link to="/" search={{ project: 'all' }} className="brand">
        <span className="brand-mark">
          <img src="/openfactory.png" width={28} height={28} alt="" />
        </span>
        openfactory<span className="brand-dot">.</span>
      </Link>
      <nav className="global-navigation" aria-label="Workspace pages">
        <Link
          to="/"
          search={{ project: 'all' }}
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
            <details className="factory-nav-group" key={project.id} open={active}>
              <summary>
                <AppearanceGlyph
                  appearance={project.icon ?? { kind: 'icon', name: 'factory', color: 'gray' }}
                  size={17}
                />
                <span className="factory-name" title={project.workspaceRoot}>
                  {project.title}
                </span>
              </summary>
              <FactoryNavigationItem
                compact
                project={project}
                active={false}
                view={
                  activeView === 'teams' || activeView === 'overview' ? 'dashboard' : activeView
                }
                count={count}
              />
              <nav aria-label={`${project.title} pages`} className="factory-navigation">
                {navigation.map(({ view, label, icon: Icon }) =>
                  view === 'teams' ? (
                    <Link
                      key={view}
                      to="/teams"
                      search={{ project: project.workspaceRoot }}
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
                      to="/"
                      search={{ project: project.workspaceRoot, view }}
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
            </details>
          );
        })}
        {projects.length === 0 && <p className="muted-copy">No factories available.</p>}
      </div>
    </aside>
  );
}
