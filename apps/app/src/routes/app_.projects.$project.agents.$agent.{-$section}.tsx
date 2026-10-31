import { SectionTabs } from '../components/section-tabs';
import { WorkspacePage } from '../components/workspace-page';
import { scheduleLabel } from '@openfactory/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, Clock3, Pause, Play, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { AgentIconPicker } from '../components/agent-icon-picker';
import { agentStateLabel } from '../components/agent-display';
import { AgentDefinition } from '../components/agent-definition';
import { AgentUsage } from '../components/agent-usage';
import { AgentSettings } from '../components/agent-settings';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { agentAction, getAgents } from '../server/agents';
import { setAgentAppearance } from '../server/factory';
import { projectWorkspace, projectAgent } from '../project-path';
import { WorkspaceUnavailable } from '../components/workspace-unavailable';
import { z } from 'zod';
const AgentConversation = lazy(() =>
  import('../components/agent-conversation').then((module) => ({
    default: module.AgentConversation,
  })),
);
export const Route = createFileRoute('/app_/projects/$project/agents/$agent/{-$section}')({
  params: {
    parse: (params) => ({
      ...params,
      section: z.enum(['runs', 'settings', 'definition']).optional().parse(params.section),
    }),
  },
  loader: async ({ params }) => {
    const workspace = await getAgents();
    if (workspace.connected) {
      projectAgent(
        params.agent,
        projectWorkspace(params.project, workspace.projects),
        workspace.agents,
      );
    }
    return workspace;
  },
  head: ({ loaderData, params }) => ({
    meta: [
      {
        title: `${(loaderData?.connected ? projectAgent(params.agent, projectWorkspace(params.project, loaderData.projects), loaderData.agents).title : undefined) ?? 'Agent'} — OpenFactory`,
      },
    ],
  }),
  component: AgentPage,
});
function AgentPage() {
  const { agent: agentSlug, project, section } = Route.useParams();
  const navigate = Route.useNavigate();
  const initialData = Route.useLoaderData();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['agents', 'workspace'],
    queryFn: () => getAgents(),
    initialData,
    refetchInterval: 10000,
  });
  const activeProject = query.data.connected ? projectWorkspace(project, query.data.projects) : '';
  const agent = query.data.connected
    ? projectAgent(agentSlug, activeProject, query.data.agents)
    : undefined;
  const tab = section ?? 'overview';
  function setTab(next: 'overview' | 'runs' | 'settings' | 'definition') {
    void navigate({
      params: { project, agent: agentSlug, section: next === 'overview' ? undefined : next },
    });
  }
  const [notice, setNotice] = useState('');
  const action = useMutation({
    mutationFn: (data: { id: string; action: 'run' | 'pause' | 'resume' }) => agentAction({ data }),
    onSuccess: (_, variables) => {
      setNotice(
        variables.action === 'run'
          ? 'Run submitted.'
          : variables.action === 'pause'
            ? 'Agent paused.'
            : 'Agent enabled.',
      );
      void client.invalidateQueries({ queryKey: ['agents'] });
      void client.invalidateQueries({ queryKey: ['agent-history', variables.id] });
      if (variables.action === 'run') {
        setTab('runs');
      }
    },
    onError: (error) => setNotice(error.message),
  });
  const appearance = useMutation({
    mutationFn: (data: Parameters<typeof setAgentAppearance>[0]['data']) =>
      setAgentAppearance({ data }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (error) => setNotice(error.message),
  });
  if (!query.data.connected) {
    return <WorkspaceUnavailable error={query.data.error} retry={() => void query.refetch()} />;
  }
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={query.data.agents}
        projects={query.data.projects}
        activeProject={activeProject}
        activeView="agents"
      />
      <div className="main-shell">
        <WorkspacePage
          contentClassName="agent-full-page"
          project={query.data.projects.find((item) => item.id === agent?.projectId)}
          title={
            agent ? (
              <>
                <Link to="/app/projects/$project/$view" params={{ project, view: 'agents' }}>
                  Agents
                </Link>
                <ChevronRight size={13} />
                <span>{agent.title}</span>
              </>
            ) : (
              'Agent not found'
            )
          }
          actions={
            agent && (
              <>
                <button
                  className="button secondary"
                  disabled={action.isPending || !query.data.connected}
                  onClick={() =>
                    action.mutate({ id: agent.id, action: agent.enabled ? 'pause' : 'resume' })
                  }
                >
                  {agent.enabled ? <Pause size={14} /> : <Play size={14} />}{' '}
                  {agent.enabled ? 'Pause' : 'Enable'}
                </button>
                <button
                  className="button primary"
                  disabled={action.isPending || !query.data.connected}
                  onClick={() => action.mutate({ id: agent.id, action: 'run' })}
                >
                  <Play size={14} />
                  Run now
                </button>
              </>
            )
          }
        >
          {agent ? (
            <>
              <SectionTabs
                label="Agent sections"
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'overview', label: 'Overview' },
                  { value: 'runs', label: 'Runs & assistant' },
                  { value: 'settings', label: 'Settings' },
                  { value: 'definition', label: 'Definition' },
                ]}
              />
              {tab === 'overview' ? (
                <>
                  <div className="agent-page-metadata" aria-label="Agent status and schedule">
                    <AgentIconPicker
                      title={agent.title}
                      appearance={query.data.appearances[agent.id]}
                      pending={appearance.isPending}
                      onSelect={(value) => appearance.mutate({ id: agent.id, appearance: value })}
                    />

                    <span
                      className={`status ${!agent.enabled ? 'muted' : agent.lastRunStatus === 'failed' ? 'bad' : 'good'}`}
                    >
                      <i />
                      {agentStateLabel(agent)}
                    </span>
                    <span>
                      <Clock3 size={13} />
                      {scheduleLabel(agent.schedule)}
                    </span>
                    <span>{agent.modelSelection.model}</span>
                  </div>
                  <AgentUsage key={agent.id} id={agent.id} />
                </>
              ) : tab === 'runs' ? (
                <Suspense fallback={<p>Loading assistant…</p>}>
                  <AgentConversation key={agent.id} agent={agent} />
                </Suspense>
              ) : tab === 'definition' ? (
                <AgentDefinition key={agent.id} agent={agent} />
              ) : (
                <AgentSettings key={agent.id} agent={agent} />
              )}
            </>
          ) : (
            <section className="empty-state">
              <h1>Agent not found</h1>
              <p>This agent may have been removed. Return to the grid to choose another agent.</p>
              <button className="button secondary" onClick={() => void query.refetch()}>
                Retry
              </button>
            </section>
          )}
        </WorkspacePage>
      </div>
      {notice && (
        <output className="toast">
          {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </output>
      )}
    </div>
  );
}
