import { WorkspacePage } from '../components/workspace-page';
import { scheduleLabel, workspaceViews } from '@openfactory/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Bot, Clock3, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { NewAgent } from '../components/new-agent';
import { PullRequests } from '../components/pull-requests';
import { FactoryPages } from '../components/factory-pages';
import { FactoryDefinition } from '../components/factory-definition';
import { AgentGlyph } from '../components/agent-icon-picker';
import { agentDate } from '../components/agent-display';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { WorkspaceUnavailable } from '../components/workspace-unavailable';
import { getPullRequestSnapshot } from '../server/pull-requests';
import { getAgents } from '../server/agents';
import { agentName, projectName, projectWorkspace } from '../project-path';
export const Route = createFileRoute('/app_/projects/$project/$view')({
  params: { parse: (params) => ({ ...params, view: z.enum(workspaceViews).parse(params.view) }) },
  loader: async ({ params }) => {
    const workspace = await getAgents();
    if (workspace.connected) {
      projectWorkspace(params.project, workspace.projects);
    }
    const pullRequestSnapshot =
      params.view === 'pull-requests' && workspace.connected
        ? await getPullRequestSnapshot({
            data: { project: projectWorkspace(params.project, workspace.projects), days: 30 },
          })
        : null;
    return { ...workspace, pullRequestSnapshot };
  },
  component: Dashboard,
});
function Dashboard() {
  const { pullRequestSnapshot, ...initialData } = Route.useLoaderData();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['agents', 'workspace'],
    queryFn: () => getAgents(),
    initialData,
    refetchInterval: 10000,
  });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const agents = query.data.agents;
  const { project: requestedProject, view: activeView } = Route.useParams();
  const navigate = Route.useNavigate();
  if (!query.data.connected) {
    return <WorkspaceUnavailable error={query.data.error} retry={() => void query.refetch()} />;
  }
  const activeProject = projectWorkspace(requestedProject, query.data.projects);
  const viewTitle =
    activeView === 'pull-requests'
      ? 'Pull requests'
      : activeView === 'definition'
        ? 'Factory definition'
        : activeView.charAt(0).toUpperCase() + activeView.slice(1);
  const projectAgents = agents.filter(
    (agent) => activeProject === 'all' || (agent.projectPath ?? agent.projectId) === activeProject,
  );
  const currentFactory = query.data.projects.find(
    (project) => project.workspaceRoot === activeProject,
  );
  const shown = projectAgents.filter((agent) =>
    `${agent.title} ${agent.prompt} ${agent.modelSelection.model}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={agents}
        activeProject={activeProject}
        activeView={activeView}
        projects={query.data.projects}
      />
      <div className="main-shell">
        {activeView === 'agents' ? (
          <WorkspacePage
            project={currentFactory}
            title={viewTitle}
            actions={
              <button
                className="button primary"
                disabled={!query.data.connected || agents.length === 0}
                onClick={() => setCreating(true)}
              >
                <Plus size={15} /> New agent
              </button>
            }
          >
            <div className="agents-toolbar">
              <div className="toolbar-actions">
                <label className="search">
                  <Search size={14} />
                  <input
                    aria-label="Search agents"
                    placeholder="Search agents…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label="Refresh agents"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  <RefreshCw size={15} className={query.isFetching ? 'spinning' : ''} />
                </button>
              </div>
            </div>
            <section className="agent-grid" aria-label="Agents">
              {shown.map((agent) => (
                <Link
                  key={agent.id}
                  to="/app/projects/$project/agents/$agent/{-$section}"
                  params={{
                    project: requestedProject,
                    agent: agentName(agent),
                    section: undefined,
                  }}
                  className="agent-card agent-card-flat"
                >
                  <span className="flat-agent-icon">
                    <AgentGlyph appearance={query.data.appearances[agent.id]} size={21} />
                  </span>
                  <h2>{agent.title}</h2>
                  <p>
                    {agent.prompt.length > 180 ? `${agent.prompt.slice(0, 180)}…` : agent.prompt}
                  </p>
                  <div className="agent-card-schedule">
                    <span className="agent-card-trigger">
                      <Clock3 size={13} aria-hidden="true" />
                      {scheduleLabel(agent.schedule)}
                    </span>
                    <span>
                      {!agent.enabled ? (
                        'Paused'
                      ) : agent.schedule.type === 'manual' ? (
                        'Runs on demand'
                      ) : agent.schedule.type === 'webhook' ? (
                        'Waiting for a request'
                      ) : agent.nextRunAt ? (
                        <>
                          Next: <time dateTime={agent.nextRunAt}>{agentDate(agent.nextRunAt)}</time>
                        </>
                      ) : (
                        'Next trigger pending'
                      )}
                    </span>
                  </div>
                </Link>
              ))}
            </section>
            {shown.length === 0 && (
              <div className="empty-state">
                <Bot size={30} />
                <h2>{agents.length ? 'No agents match this view' : 'No agents yet'}</h2>
                <p>
                  {agents.length
                    ? 'Try another search.'
                    : query.data.connected
                      ? 'Create an agent to start work in this factory.'
                      : 'Start the OpenFactory runtime to load your agents.'}
                </p>
              </div>
            )}
          </WorkspacePage>
        ) : activeView === 'definition' ? (
          <FactoryDefinition
            project={currentFactory}
            projects={query.data.projects}
            onSelectProject={(project) =>
              void navigate({
                to: '/app/projects/$project/$view',
                params: { project: projectName(project), view: 'definition' },
              })
            }
          />
        ) : activeView === 'pull-requests' ? (
          <WorkspacePage project={currentFactory} title={viewTitle}>
            <PullRequests
              key={activeProject}
              project={activeProject}
              scope={query.data.cacheScope}
              snapshot={pullRequestSnapshot}
            />
          </WorkspacePage>
        ) : (
          <FactoryPages
            factory={currentFactory}
            key={`${activeProject}:${activeView}`}
            view={activeView}
            project={activeProject}
            agents={projectAgents}
          />
        )}
      </div>
      {notice && (
        <output className="toast">
          {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </output>
      )}
      {creating && (
        <NewAgent
          agents={agents}
          targetProject={query.data.projects.find(
            (project) => project.workspaceRoot === activeProject,
          )}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setNotice('Agent created paused. Enable it when ready.');
            void client.invalidateQueries({ queryKey: ['agents'] });
          }}
        />
      )}
    </div>
  );
}
