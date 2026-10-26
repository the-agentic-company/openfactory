import { workspaceViews, type Agent } from '@openfactory/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import { Bot, ChevronRight, Folder, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Modal } from '../components/modal';
import { PullRequests } from '../components/pull-requests';
import { FactoryPages } from '../components/factory-pages';
import { FactoryDefinition } from '../components/factory-definition';
import { AgentGlyph } from '../components/agent-icon-picker';
import { FactoriesOverview } from '../components/factories-overview';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { createAgent, getAgents } from '../server/agents';
export const Route = createFileRoute('/')({
  validateSearch: z.object({
    project: z.string().catch('all'),
    view: z.enum(workspaceViews).optional().catch('dashboard'),
  }),
  loaderDeps: ({ search }) => ({ project: search.project, view: search.view }),
  loader: async ({ deps }) => {
    const workspace = await getAgents();
    if (
      deps.project === 'all'
        ? deps.view !== undefined
        : !workspace.projects.some((project) => project.workspaceRoot === deps.project)
    ) {
      throw redirect({ to: '/', search: { project: 'all' }, replace: true });
    }
    return workspace;
  },
  component: Dashboard,
});
function Dashboard() {
  const initialData = Route.useLoaderData();
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
  const { project: activeProject } = Route.useSearch();
  const navigate = Route.useNavigate();
  const projects = query.data.projects.map((project) => ({
    key: project.workspaceRoot,
    name: project.title,
  }));
  const activeView = Route.useSearch().view ?? 'dashboard';
  const viewTitle =
    activeView === 'pull-requests'
      ? 'Pull requests'
      : activeView === 'definition'
        ? 'Factory definition'
        : activeView.charAt(0).toUpperCase() + activeView.slice(1);
  const projectAgents = agents.filter(
    (agent) => activeProject === 'all' || (agent.projectPath ?? agent.projectId) === activeProject,
  );
  const currentProject = projects.find((project) => project.key === activeProject);
  const currentFactory = query.data.projects.find(
    (project) => project.workspaceRoot === activeProject,
  );
  const shown = projectAgents.filter((agent) =>
    `${agent.title} ${agent.prompt} ${agent.modelSelection.model}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  if (activeProject === 'all') {
    return (
      <div className="app-shell">
        <WorkspaceSidebar agents={agents} projects={query.data.projects} activeView="overview" />
        <div className="main-shell">
          <main>
            <FactoriesOverview
              agents={agents}
              projects={query.data.projects}
              error={query.data.error}
              refreshing={query.isFetching}
              onRefresh={() => void query.refetch()}
            />
          </main>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`app-shell ${activeView === 'dashboard' ? 'analytics-workspace' : activeView === 'definition' ? 'factory-definition-shell' : ''}`}
    >
      <WorkspaceSidebar
        agents={agents}
        activeProject={activeProject}
        activeView={activeView}
        projects={query.data.projects}
      />
      <div className="main-shell">
        <main>
          <div className="workspace-toolbar">
            <div>
              <div className="factory-breadcrumb">
                <Folder size={14} />
                {currentProject?.name ?? 'Factories'}
                <ChevronRight size={13} />
                {viewTitle}
              </div>
            </div>
            {activeView === 'agents' && (
              <button
                className="button primary"
                disabled={!query.data.connected || agents.length === 0}
                onClick={() => setCreating(true)}
              >
                <Plus size={15} /> New agent
              </button>
            )}
          </div>
          {activeView === 'agents' ? (
            <>
              {query.data.error && (
                <div className="error-banner" role="alert">
                  <strong>Connection needs attention.</strong> {query.data.error}{' '}
                  <button onClick={() => void query.refetch()}>Retry connection</button>
                </div>
              )}
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
                    to="/agents/$agentId"
                    params={{ agentId: agent.id }}
                    search={{ project: activeProject }}
                    className="agent-card agent-card-flat"
                  >
                    <span className="flat-agent-icon">
                      <AgentGlyph appearance={query.data.appearances[agent.id]} size={21} />
                    </span>
                    <h2>{agent.title}</h2>
                    <p>
                      {agent.prompt.length > 180 ? `${agent.prompt.slice(0, 180)}…` : agent.prompt}
                    </p>
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
                        ? 'No scheduled agents were found in this T3 environment.'
                        : 'Connect to T3 Code to load your agents.'}
                  </p>
                </div>
              )}
            </>
          ) : activeView === 'definition' ? (
            <FactoryDefinition
              project={currentFactory}
              projects={query.data.projects}
              onSelectProject={(project) =>
                void navigate({ search: { project, view: 'definition' } })
              }
            />
          ) : activeView === 'pull-requests' ? (
            <PullRequests key={activeProject} project={activeProject} />
          ) : (
            <FactoryPages
              key={`${activeProject}:${activeView}`}
              view={activeView}
              project={activeProject}
              agents={projectAgents}
              factoryName={currentProject?.name ?? 'All runs'}
            />
          )}
        </main>
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
function NewAgent({
  agents,
  targetProject,
  onClose,
  onCreated,
}: {
  agents: Agent[];
  targetProject?: { id: string; title: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [trigger, setTrigger] = useState<'interval' | 'fixed_time' | 'webhook'>('interval');
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof createAgent>[0]['data']) => createAgent({ data }),
    onSuccess: onCreated,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const field = (name: string, fallback = '') => {
      const value = fields.get(name);
      return typeof value === 'string' ? value : fallback;
    };
    mutation.mutate({
      title: field('title'),
      prompt: field('prompt'),
      sourceId: field('sourceId'),
      projectId: targetProject?.id,
      trigger,
      minutes: Number(field('minutes', '60')),
      timeOfDay: field('timeOfDay', '09:00'),
    });
  }
  return (
    <Modal titleId="create-title" onClose={onClose}>
      <div className="modal-heading">
        <button className="icon-button" aria-label="Close new agent" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h2 id="create-title">Create an agent</h2>
      <p>Choose its instructions and schedule. New agents start paused.</p>
      <form onSubmit={submit}>
        <label>
          Name
          <input
            required
            name="title"
            maxLength={120}
            placeholder="e.g. Morning project briefing"
          />
        </label>
        <label>
          Instructions
          <textarea
            required
            name="prompt"
            maxLength={16000}
            rows={5}
            placeholder="What should this agent do? Webhooks can use {{body.event}}."
          />
        </label>
        <label>
          Trigger
          <select value={trigger} onChange={(e) => setTrigger(e.target.value as typeof trigger)}>
            <option value="interval">Repeating interval</option>
            <option value="fixed_time">Daily at a fixed time</option>
            <option value="webhook">Incoming webhook</option>
          </select>
        </label>
        {trigger === 'interval' && (
          <label>
            Interval in minutes
            <input name="minutes" type="number" defaultValue={60} min={1} max={525600} required />
          </label>
        )}
        {trigger === 'fixed_time' && (
          <label>
            Time (T3 host timezone)
            <input name="timeOfDay" type="time" defaultValue="09:00" required />
          </label>
        )}
        <label>
          {targetProject ? 'Inherit runtime from' : 'Inherit project and runtime from'}
          <select name="sourceId">
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.title} · {agent.modelSelection.model}
              </option>
            ))}
          </select>
        </label>
        <p className="detail-note">
          Creates a paused agent{' '}
          {targetProject ? `in ${targetProject.title}` : 'in the selected runtime’s project'}. Each
          run starts a new conversation using the same model, tools, and permissions.
        </p>
        {mutation.isError && (
          <p role="alert" className="error-banner">
            {mutation.error.message}
          </p>
        )}
        <button className="button primary" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Creating…' : 'Create paused agent'}
          <Plus size={14} />
        </button>
      </form>
    </Modal>
  );
}
