import { parseTeamYaml, teamTriggerLabel, type AgentTeam, type TeamAgent } from '@openfactory/core';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../components/modal';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { getAgents } from '../server/agents';
import { ClientOnly, Link, createFileRoute } from '@tanstack/react-router';
import {
  Bot,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  FileCode2,
  Folder,
  GitFork,
  Maximize2,
  Network,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import demoYaml from '../../../../teams/reliability.yaml?raw';
import teamStyles from '../teams.css?url';

export const Route = createFileRoute('/teams')({
  validateSearch: z.object({ project: z.string().optional() }),
  component: TeamPage,
  loader: () => getAgents(),
  head: () => ({
    meta: [{ title: 'Teams — OpenFactory' }],
    links: [{ rel: 'stylesheet', href: teamStyles }],
  }),
});
const demoTeam = parseTeamYaml(demoYaml);
const draftKey = 'openfactory.reliability-team.v1';

function AgentGlyph({ agent, size = 18 }: { agent: TeamAgent; size?: number }) {
  if (!agent.reports_to) {
    return <GitFork size={size} />;
  }
  if (agent.trigger.type === 'daily') {
    return <FileCode2 size={size} />;
  }
  if (agent.trigger.type === 'interval') {
    return <ShieldCheck size={size} />;
  }
  return <Bot size={size} />;
}

function TeamBranch({
  agent,
  team,
  selectedId,
  select,
}: {
  agent: TeamAgent;
  team: AgentTeam;
  selectedId: string;
  select: (id: string) => void;
}) {
  const children = team.agents.filter((member) => member.reports_to === agent.id);
  return (
    <li>
      <button
        className={`org-agent ${selectedId === agent.id ? 'is-selected' : ''}`}
        aria-pressed={selectedId === agent.id}
        onClick={() => select(agent.id)}
      >
        <span className="org-agent-heading">
          <span className={`team-glyph ${!agent.reports_to ? 'lead' : ''}`}>
            <AgentGlyph agent={agent} />
          </span>
          <span className="org-agent-id">{agent.id}</span>
          <ChevronRight size={13} />
        </span>
        <strong>{agent.name}</strong>
        <span className="org-agent-role">{agent.role}</span>
        <span className="org-agent-trigger">
          <Clock3 size={11} />
          {teamTriggerLabel(agent.trigger)}
        </span>
      </button>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <TeamBranch
              key={child.id}
              agent={child}
              team={team}
              selectedId={selectedId}
              select={select}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function TeamPage() {
  return (
    <ClientOnly fallback={<div className="team-loading">Loading your team…</div>}>
      <TeamFactory />
    </ClientOnly>
  );
}

function readDraft(project: string) {
  try {
    const saved =
      localStorage.getItem(`${draftKey}:${project}`) ??
      (project === demoTeam.project ? localStorage.getItem(draftKey) : null);
    if (saved) {
      return { team: parseTeamYaml(saved), notice: '' };
    }
  } catch {
    return {
      team: demoTeam,
      notice: 'The saved draft could not be loaded. The repository demo is open.',
    };
  }
  return { team: demoTeam, notice: '' };
}

function TeamFactory() {
  const initialData = Route.useLoaderData();
  const workspace = useQuery({
    queryKey: ['agents'],
    queryFn: () => getAgents(),
    initialData,
    refetchInterval: 10000,
  });
  const requestedProject = Route.useSearch().project;
  const activeProject =
    workspace.data.projects.find((project) => project.workspaceRoot === requestedProject)
      ?.workspaceRoot ??
    workspace.data.projects[0]?.workspaceRoot ??
    '';
  return (
    <FactoryTeam key={activeProject} workspace={workspace.data} activeProject={activeProject} />
  );
}

function FactoryTeam({
  workspace,
  activeProject,
}: {
  workspace: Awaited<ReturnType<typeof getAgents>>;
  activeProject: string;
}) {
  const [initial] = useState(() => readDraft(activeProject));
  const team = initial.team;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState(initial.notice);
  const [zoom, setZoom] = useState(1);
  const tree = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const selected = team.agents.find((agent) => agent.id === selectedId);
  const lead = team.agents.find((agent) => !agent.reports_to);
  const schedules = team.agents.filter(
    (agent) => agent.trigger.type === 'daily' || agent.trigger.type === 'interval',
  );

  useEffect(() => {
    const surface = canvas.current;
    const chart = tree.current;
    if (!surface || !chart) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setZoom(
        surface.clientWidth < 600 ? 1 : Math.min(1, (surface.clientWidth - 32) / chart.scrollWidth),
      );
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [team]);

  function fitChart() {
    if (canvas.current && tree.current) {
      setZoom(Math.min(1, (canvas.current.clientWidth - 32) / tree.current.scrollWidth));
    }
  }
  return (
    <div className="app-shell team-factory">
      <WorkspaceSidebar
        agents={workspace.agents}
        projects={workspace.projects}
        activeView="teams"
        activeProject={activeProject}
      />
      <div className="main-shell">
        <main className="team-page">
          <header className="team-topbar workspace-toolbar">
            <span>
              <Link to="/" search={{ project: activeProject, view: 'agents' }}>
                Agents
              </Link>{' '}
              <ChevronRight size={13} />
              <span>Teams</span>
              <ChevronRight size={13} />
              <strong>
                {activeProject === demoTeam.project
                  ? team.name
                  : workspace.projects.find((project) => project.workspaceRoot === activeProject)
                      ?.title}
              </strong>
            </span>
            {activeProject === demoTeam.project && (
              <span className="team-demo-label">
                <Circle size={7} fill="currentColor" />
                Interactive demo
              </span>
            )}
          </header>
          {activeProject !== demoTeam.project ? (
            <div className="empty-state">
              <Network size={30} />
              <h2>No teams defined for this factory</h2>
              <p>The reliability team demo belongs to its Mibba factory.</p>
            </div>
          ) : (
            <>
              <div className="team-project">
                <Folder size={15} />
                <strong>{team.project.split('/').at(-1)}</strong>
                <span>{team.project}</span>
                <span className="team-project-separator" />
                <span>{team.agents.length} agents</span>
                <span>{schedules.length} scheduled roles</span>
              </div>
              {notice && (
                <output className="team-notice">
                  <Check size={14} />
                  {notice}
                  <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                    Dismiss
                  </button>
                </output>
              )}
              <div className="team-studio">
                <section className="team-chart-panel" aria-label="Team organization chart">
                  <div className="org-canvas" ref={canvas}>
                    <div className="org-zoom-space" style={{ minWidth: `${800 * zoom}px` }}>
                      <div className="org-tree" ref={tree} style={{ zoom }}>
                        <ul>
                          {lead && (
                            <TeamBranch
                              agent={lead}
                              team={team}
                              selectedId={selected?.id ?? ''}
                              select={setSelectedId}
                            />
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="team-chart-footer">
                    <span>
                      <span className="org-key-line" />
                      Reporting line
                    </span>
                    <div>
                      <button
                        aria-label="Zoom out"
                        disabled={zoom <= 0.5}
                        onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                      >
                        <ZoomOut size={16} />
                      </button>
                      <span>{Math.round(zoom * 100)}%</span>
                      <button
                        aria-label="Zoom in"
                        disabled={zoom >= 1.3}
                        onClick={() => setZoom(Math.min(1.3, zoom + 0.1))}
                      >
                        <ZoomIn size={16} />
                      </button>
                      <button aria-label="Fit chart" onClick={fitChart}>
                        <Maximize2 size={15} />
                      </button>
                    </div>
                  </div>
                </section>
              </div>
              {selected && (
                <Modal titleId="team-agent-title" onClose={() => setSelectedId(null)}>
                  <div className="modal-heading">
                    <button
                      className="icon-button"
                      aria-label="Close agent definition"
                      onClick={() => setSelectedId(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <AgentInspector selected={selected} team={team} />
                </Modal>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function AgentInspector({ selected, team }: { selected: TeamAgent; team: AgentTeam }) {
  const manager = team.agents.find((agent) => agent.id === selected.reports_to);
  const reports = team.agents.filter((agent) => agent.reports_to === selected.id);
  return (
    <section className="team-inspector" aria-label="Selected agent details">
      <div className="team-inspector-top">
        <span>Agent definition</span>
        <code>{selected.id}</code>
      </div>
      <div className="team-inspector-title">
        <span className="team-glyph lead">
          <AgentGlyph agent={selected} size={22} />
        </span>
        <h2 id="team-agent-title">{selected.name}</h2>
        <p>{selected.role}</p>
      </div>
      <dl className="team-agent-facts">
        <div>
          <dt>Model</dt>
          <dd>{selected.model}</dd>
        </div>
        <div>
          <dt>Trigger</dt>
          <dd>{teamTriggerLabel(selected.trigger)}</dd>
        </div>
        {selected.trigger.type === 'daily' && (
          <div>
            <dt>Timezone</dt>
            <dd>{selected.trigger.timezone}</dd>
          </div>
        )}
        <div>
          <dt>Reports to</dt>
          <dd>{manager?.name ?? 'Team owner (you)'}</dd>
        </div>
        <div>
          <dt>Direct reports</dt>
          <dd>{reports.length ? reports.map((agent) => agent.name).join(', ') : 'None'}</dd>
        </div>
      </dl>
      <div className="team-prompt">
        <h3>
          <Code2 size={15} />
          System prompt
        </h3>
        <p>{selected.prompt}</p>
      </div>
      <div className="team-inspector-workspace">
        <Folder size={14} />
        <div>
          <span>Working directory</span>
          <code>{team.workspace}</code>
        </div>
      </div>
    </section>
  );
}
