import { scheduleLabel } from '@openfactory/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, ChevronRight, Clock3, Pause, Play, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { z } from 'zod';
import { AgentIconPicker } from '../components/agent-icon-picker';
import { agentStateLabel } from '../components/agent-display';
import { AgentDefinition } from '../components/agent-definition';
import { AgentUsage } from '../components/agent-usage';
import { AgentSettings } from '../components/agent-settings';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { agentAction, getAgents } from '../server/agents';
import { setAgentAppearance } from '../server/factory';
const AgentConversation = lazy(() =>
  import('../components/agent-conversation').then((module) => ({
    default: module.AgentConversation,
  })),
);
export const Route = createFileRoute('/agents/$agentId')({
  validateSearch: z.object({ project: z.string().optional() }),
  loader: () => getAgents(),
  head: ({ loaderData, params }) => ({
    meta: [
      {
        title: `${loaderData?.agents.find((agent) => agent.id === params.agentId)?.title ?? 'Agent'} — OpenFactory`,
      },
    ],
  }),
  component: AgentPage,
});
function AgentPage() {
  const { agentId } = Route.useParams();
  const { project } = Route.useSearch();
  const initialData = Route.useLoaderData();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['agents', 'workspace'],
    queryFn: () => getAgents(),
    initialData,
    refetchInterval: 10000,
  });
  const agent = query.data.agents.find((item) => item.id === agentId);
  const activeProject = project ?? agent?.projectPath ?? agent?.projectId ?? 'all';
  const [tab, setTab] = useState<'history' | 'settings' | 'definition'>('history');
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
      void client.invalidateQueries({ queryKey: ['agent-history', agentId] });
      if (variables.action === 'run') {
        setTab('history');
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
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={query.data.agents}
        projects={query.data.projects}
        activeProject={activeProject}
        activeView="agents"
      />
      <div className="main-shell">
        <main className="agent-full-page">
          <Link
            to="/"
            search={{ project: activeProject, view: 'agents' }}
            className="agent-back-link"
          >
            <ArrowLeft size={15} />
            Back to agents
          </Link>
          {agent ? (
            <>
              <div className="factory-breadcrumb">
                <Link
                  to="/"
                  search={{ project: agent.projectPath ?? agent.projectId, view: 'agents' }}
                >
                  {agent.projectName}
                </Link>
                <ChevronRight size={13} />
                Agents
                <ChevronRight size={13} />
                <span>{agent.title}</span>
              </div>
              <header className="agent-page-heading">
                <AgentIconPicker
                  title={agent.title}
                  appearance={query.data.appearances[agent.id]}
                  pending={appearance.isPending}
                  onSelect={(value) => appearance.mutate({ id: agent.id, appearance: value })}
                />
                <div>
                  <h1>{agent.title}</h1>
                  <p>
                    {agent.prompt
                      .split('\n')
                      .find((line) => line.trim())
                      ?.slice(0, 200)}
                  </p>
                </div>
                <div className="agent-page-actions">
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
                </div>
              </header>
              <div className="agent-page-metadata">
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
              {!query.data.connected && (
                <div className="error-banner" role="alert">
                  {query.data.error}
                  <button onClick={() => void query.refetch()}>Retry connection</button>
                </div>
              )}
              <AgentUsage key={agent.id} id={agent.id} />
              <nav className="detail-tabs agent-page-tabs" aria-label="Agent sections">
                <button
                  type="button"
                  className={tab === 'history' ? 'selected' : ''}
                  aria-pressed={tab === 'history'}
                  onClick={() => setTab('history')}
                >
                  Runs & assistant
                </button>
                <button
                  type="button"
                  className={tab === 'settings' ? 'selected' : ''}
                  aria-pressed={tab === 'settings'}
                  onClick={() => setTab('settings')}
                >
                  Settings
                </button>
                <button
                  type="button"
                  className={tab === 'definition' ? 'selected' : ''}
                  aria-pressed={tab === 'definition'}
                  onClick={() => setTab('definition')}
                >
                  Definition
                </button>
              </nav>
              {tab === 'history' ? (
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
              <h1>{query.data.connected ? 'Agent not found' : 'Unable to load agent'}</h1>
              <p>
                {query.data.connected
                  ? 'This agent may have been removed. Return to the grid to choose another agent.'
                  : query.data.error}
              </p>
              <button className="button secondary" onClick={() => void query.refetch()}>
                Retry
              </button>
            </section>
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
    </div>
  );
}
