import { SectionTabs } from '../components/section-tabs';
import { Select, SelectItem } from '../components/ui/select';
import { runPathParams } from '../run-path';
import { WorkspacePage } from '../components/workspace-page';
import { scheduleLabel, type AgentTeam, type TeamAgent } from '@openfactory/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../components/modal';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { WorkspaceUnavailable } from '../components/workspace-unavailable';
import { getAgents } from '../server/agents';
import { getFactoryTeams, createFactoryTeam, runFactoryTeam } from '../server/teams';
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import {
  Bot,
  ChevronRight,
  Clock3,
  Code2,
  FileCode2,
  GitFork,
  Network,
  Play,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import flowStyles from '@xyflow/react/dist/style.css?url';
import teamStyles from '../teams.css?url';
import { z } from 'zod';
import { agentName, projectWorkspace } from '../project-path';

export const Route = createFileRoute('/app_/projects/$project/teams/{-$section}')({
  params: {
    parse: (params) => ({
      ...params,
      section: z.literal('definition').optional().parse(params.section),
    }),
  },
  component: TeamPage,
  loader: () => getAgents(),
  head: () => ({
    meta: [{ title: 'Teams — OpenFactory' }],
    links: [
      { rel: 'stylesheet', href: flowStyles },
      { rel: 'stylesheet', href: teamStyles },
    ],
  }),
});

function AgentGlyph({ agent, size = 18 }: { agent: TeamAgent; size?: number }) {
  if (!agent.reportsTo) {
    return <GitFork size={size} />;
  }
  if (agent.agent.schedule.type === 'fixed_time') {
    return <FileCode2 size={size} />;
  }
  if (agent.agent.schedule.type === 'interval') {
    return <ShieldCheck size={size} />;
  }
  return <Bot size={size} />;
}

type AgentNode = Node<{ agent: TeamAgent; hasReports: boolean; open: () => void }, 'agent'>;

function TeamAgentNode({ data }: NodeProps<AgentNode>) {
  const { agent, hasReports, open } = data;
  return (
    <>
      {agent.reportsTo && <Handle type="target" position={Position.Top} />}
      <button
        className="org-agent nodrag"
        onClick={open}
        aria-label={`Open ${agent.agent.title} details`}
      >
        <span className="org-agent-heading">
          <span className={`team-glyph ${!agent.reportsTo ? 'lead' : ''}`}>
            <AgentGlyph agent={agent} />
          </span>
          <span className="org-agent-id">{agent.id}</span>
          <ChevronRight size={13} />
        </span>
        <strong>{agent.agent.title}</strong>
        <span className="org-agent-role">
          {agent.agent.enabled ? 'Enabled' : 'Paused'} · {agent.agent.lastRunStatus}
        </span>
        <span className="org-agent-trigger">
          <Clock3 size={11} />
          {scheduleLabel(agent.agent.schedule)}
        </span>
      </button>
      {hasReports && <Handle type="source" position={Position.Bottom} />}
    </>
  );
}

type TeamHeadingNode = Node<{ team: AgentTeam }, 'team'>;

function TeamHeading({ data }: NodeProps<TeamHeadingNode>) {
  return (
    <div className="org-team-heading">
      <h2>{data.team.definition.name}</h2>
    </div>
  );
}

const nodeTypes = { agent: TeamAgentNode, team: TeamHeading };

function createTeamGraph(team: AgentTeam, select: (id: string) => void) {
  const nodes: AgentNode[] = [];
  const edges: Edge[] = [];
  const childrenOf = (id: string) => team.agents.filter((agent) => agent.reportsTo === id);
  const branchWidth = (agent: TeamAgent): number =>
    Math.max(
      1,
      childrenOf(agent.id).reduce((width, child) => width + branchWidth(child), 0),
    );

  function place(agent: TeamAgent, left: number, depth: number) {
    const children = childrenOf(agent.id);
    const width = branchWidth(agent);
    nodes.push({
      id: agent.id,
      type: 'agent',
      position: { x: (left + width / 2) * 240 - 100, y: depth * 240 },
      data: { agent, hasReports: children.length > 0, open: () => select(agent.id) },
      ariaLabel: `${agent.agent.title}: ${agent.agent.lastRunStatus}. Open agent details`,
    });
    if (agent.reportsTo) {
      edges.push({
        id: `${agent.reportsTo}-${agent.id}`,
        source: agent.reportsTo,
        target: agent.id,
        type: 'smoothstep',
      });
    }
    let offset = left;
    for (const child of children) {
      place(child, offset, depth + 1);
      offset += branchWidth(child);
    }
  }

  let offset = 0;
  for (const root of team.agents.filter((agent) => !agent.reportsTo)) {
    place(root, offset, 0);
    offset += branchWidth(root);
  }
  return { nodes, edges };
}

function TeamCanvas({
  teams,
  select,
}: {
  teams: AgentTeam[];
  select: (teamPath: string, agentId: string) => void;
}) {
  const nodes: (AgentNode | TeamHeadingNode)[] = [];
  const edges: Edge[] = [];
  let left = 0;
  for (const team of teams) {
    const graph = createTeamGraph(team, (agentId) => select(team.path, agentId));
    const width = Math.max(360, ...graph.nodes.map((node) => node.position.x + 220));
    const nodeId = (id: string) => JSON.stringify([team.path, id]);
    nodes.push({
      id: JSON.stringify([team.path]),
      type: 'team',
      position: { x: left + width / 2 - 160, y: 0 },
      width: 320,
      height: 56,
      data: { team },
    });
    nodes.push(
      ...graph.nodes.map((node) => ({
        ...node,
        id: nodeId(node.id),
        position: { x: left + node.position.x, y: node.position.y + 96 },
      })),
    );
    edges.push(
      ...graph.edges.map((edge) => ({
        ...edge,
        id: nodeId(edge.id),
        source: nodeId(edge.source),
        target: nodeId(edge.target),
      })),
    );
    left += width + 120;
  }
  return (
    <section className="org-canvas" aria-label="All teams organization chart">
      <ReactFlow<AgentNode | TeamHeadingNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesFocusable={false}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        minZoom={0.02}
        maxZoom={1.8}
        colorMode="light"
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} orientation="horizontal" />
      </ReactFlow>
    </section>
  );
}

function TeamPage() {
  return (
    <ClientOnly fallback={<div className="team-loading">Loading your team…</div>}>
      <TeamFactory />
    </ClientOnly>
  );
}

function TeamFactory() {
  const workspace = useQuery({
    queryKey: ['agents'],
    queryFn: () => getAgents(),
    initialData: Route.useLoaderData(),
    refetchInterval: 10000,
  });
  const requestedProject = Route.useParams().project;
  if (!workspace.data.connected) {
    return (
      <WorkspaceUnavailable error={workspace.data.error} retry={() => void workspace.refetch()} />
    );
  }
  const activeProject = projectWorkspace(requestedProject, workspace.data.projects);
  const project = workspace.data.projects.find((item) => item.workspaceRoot === activeProject);
  if (!project) {
    return <p role="alert">This factory no longer exists.</p>;
  }
  return (
    <FactoryTeam
      key={project.id}
      workspace={workspace.data}
      activeProject={activeProject}
      projectId={project.id}
    />
  );
}

function FactoryTeam({
  workspace,
  activeProject,
  projectId,
}: {
  workspace: Awaited<ReturnType<typeof getAgents>>;
  activeProject: string;
  projectId: string;
}) {
  const client = useQueryClient();
  const { project, section } = Route.useParams();
  const navigate = Route.useNavigate();
  const tab = section ?? 'organization';
  const query = useQuery({
    queryKey: ['factory-teams', projectId],
    queryFn: () => getFactoryTeams({ data: { projectId } }),
    refetchInterval: 10000,
  });
  const [selection, setSelection] = useState<{ teamPath: string; agentId: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const selectedTeam = query.data?.teams.find((item) => item.path === selection?.teamPath);
  const selected = selectedTeam?.agents.find((member) => member.id === selection?.agentId);
  const agents = workspace.agents.filter((agent) => agent.projectId === projectId);
  const run = useMutation({
    mutationFn: ({ path, member }: { path: string; member?: string }) =>
      runFactoryTeam({ data: { projectId, path, member } }),
    onSuccess: (receipt) => {
      void client.invalidateQueries({ queryKey: ['agents'] });
      void client.invalidateQueries({ queryKey: ['factory-teams', projectId] });
      void navigate({
        to: '/app/projects/$project/threads/$thread/runs/$runId/{-$section}',
        params: {
          ...runPathParams({ project, id: receipt.runId, threadId: receipt.threadId }),
          section: undefined,
        },
      });
    },
  });
  function setTab(next: 'organization' | 'definition') {
    void navigate({ params: { project, section: next === 'organization' ? undefined : next } });
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
        <WorkspacePage
          layout="fill"
          contentClassName="team-page"
          project={workspace.projects.find((item) => item.id === projectId)}
          title="Teams"
          actions={
            <div className="definition-actions">
              <button
                className="button secondary"
                disabled={!agents.length}
                onClick={() => setCreating(true)}
              >
                <Plus size={14} />
                Create team
              </button>
            </div>
          }
        >
          {query.isPending && <p className="team-loading">Loading teams…</p>}
          {query.isError && (
            <p className="error-banner" role="alert">
              {query.error.message} <button onClick={() => void query.refetch()}>Retry</button>
            </p>
          )}
          {run.isError && (
            <p className="error-banner" role="alert">
              {run.error.message}
            </p>
          )}
          {query.isSuccess && !query.data.teams.length && (
            <div className="empty-state">
              <Network size={30} />
              <h2>No teams defined for this factory</h2>
              <p>
                {agents.length
                  ? 'Create a team from your existing agents.'
                  : 'Create an agent before setting up a team.'}
              </p>
            </div>
          )}
          {!!query.data?.teams.length && (
            <>
              <SectionTabs
                label="Team sections"
                value={tab}
                onChange={setTab}
                items={[
                  {
                    value: 'organization',
                    label: (
                      <>
                        <Network size={14} />
                        Organization
                      </>
                    ),
                  },
                  {
                    value: 'definition',
                    label: (
                      <>
                        <FileCode2 size={14} />
                        Definition
                      </>
                    ),
                  },
                ]}
              />
              <div className="team-tab-panel">
                {tab === 'organization' ? (
                  <TeamCanvas
                    key={JSON.stringify(query.data?.teams)}
                    teams={query.data?.teams ?? []}
                    select={(teamPath, agentId) => setSelection({ teamPath, agentId })}
                  />
                ) : (
                  query.data?.teams.map((team) => (
                    <section
                      className="team-section"
                      key={team.path}
                      aria-label={team.definition.name}
                    >
                      <header className="team-section-header">
                        <h2>{team.definition.name}</h2>
                      </header>
                      <section className="team-definition" aria-label="Team definition">
                        <div className="team-definition-file">
                          <FileCode2 size={15} />
                          <span>{team.path}</span>
                          <Link
                            to="/app/projects/$project/$view"
                            params={{ project, view: 'definition' }}
                          >
                            Edit factory files
                          </Link>
                        </div>
                        <pre className="team-definition-source">
                          <code>{team.source}</code>
                        </pre>
                        {team.definition.instructions && (
                          <>
                            <div className="team-definition-file">
                              <FileCode2 size={15} />
                              <span>{team.path.replace(/team\.yaml$/, 'instructions.md')}</span>
                            </div>
                            <pre className="team-definition-source">
                              <code>{team.instructions || 'No shared instructions.'}</code>
                            </pre>
                          </>
                        )}
                      </section>
                    </section>
                  ))
                )}
              </div>
              {selected && selectedTeam && (
                <Modal titleId="team-agent-title" onClose={() => setSelection(null)}>
                  <div className="modal-heading">
                    <button
                      className="icon-button"
                      aria-label="Close agent definition"
                      onClick={() => setSelection(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <AgentInspector selected={selected} team={selectedTeam} project={project} />
                  <button
                    className="button primary"
                    disabled={run.isPending}
                    onClick={() => run.mutate({ path: selectedTeam.path, member: selected.id })}
                  >
                    <Play size={14} />
                    Run agent
                  </button>
                </Modal>
              )}
            </>
          )}
          {creating && (
            <CreateTeam
              projectId={projectId}
              agents={agents}
              close={() => setCreating(false)}
              created={() => {
                setCreating(false);
                void client.invalidateQueries({ queryKey: ['factory-teams', projectId] });
                void client.invalidateQueries({ queryKey: ['factory-definition', projectId] });
              }}
            />
          )}
        </WorkspacePage>
      </div>
    </div>
  );
}

function CreateTeam({
  projectId,
  agents,
  close,
  created,
}: {
  projectId: string;
  agents: Awaited<ReturnType<typeof getAgents>>['agents'];
  close: () => void;
  created: (path: string) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lead, setLead] = useState(agents[0]?.id ?? '');
  const [members, setMembers] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const memberIds = new Set(members);
  const save = useMutation({
    mutationFn: () =>
      createFactoryTeam({
        data: {
          projectId,
          name,
          slug: name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
          description,
          leadAgentId: lead,
          memberAgentIds: [...new Set([lead, ...members])],
          instructions,
        },
      }),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ['factory-teams', projectId] });
      void client.invalidateQueries({ queryKey: ['factory-definition', projectId] });
      created(result.path);
    },
  });
  return (
    <Modal titleId="create-team-title" onClose={close}>
      <form
        className="team-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="modal-heading">
          <h2 id="create-team-title">Create team</h2>
          <button type="button" className="icon-button" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <label>
          Name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Description
          <input
            required
            maxLength={400}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label htmlFor="projects-select-2">
          Team lead
          <Select id="projects-select-2" value={lead} onValueChange={(value) => setLead(value)}>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.title}
              </SelectItem>
            ))}
          </Select>
        </label>
        <fieldset>
          <legend>Members</legend>
          {agents
            .filter((agent) => agent.id !== lead)
            .map((agent) => (
              <label className="team-member-choice" key={agent.id}>
                <input
                  type="checkbox"
                  checked={memberIds.has(agent.id)}
                  onChange={(event) =>
                    setMembers((previous) =>
                      event.target.checked
                        ? [...previous, agent.id]
                        : previous.filter((id) => id !== agent.id),
                    )
                  }
                />
                {agent.title}
              </label>
            ))}
        </fieldset>
        <label>
          Shared instructions
          <textarea
            rows={5}
            maxLength={16000}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
        {save.isError && (
          <p className="error-banner" role="alert">
            {save.error.message}
          </p>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={save.isPending || !name.trim() || !description.trim()}
        >
          {save.isPending ? 'Creating…' : 'Create team'}
        </button>
      </form>
    </Modal>
  );
}

function AgentInspector({
  selected,
  team,
  project,
}: {
  selected: TeamAgent;
  team: AgentTeam;
  project: string;
}) {
  const manager = team.agents.find((member) => member.id === selected.reportsTo);
  const agent = selected.agent;
  return (
    <section className="team-inspector" aria-label="Selected agent details">
      <div className="team-inspector-top">
        <span>Live agent</span>
        <code>{selected.id}</code>
      </div>
      <div className="team-inspector-title">
        <span className="team-glyph lead">
          <AgentGlyph agent={selected} size={22} />
        </span>
        <h2 id="team-agent-title">{agent.title}</h2>
        <p>{selected.agentPath}</p>
      </div>
      <dl className="team-agent-facts">
        <div>
          <dt>Model</dt>
          <dd>{agent.modelSelection.model}</dd>
        </div>
        <div>
          <dt>Schedule</dt>
          <dd>{scheduleLabel(agent.schedule)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            {agent.enabled ? 'Enabled' : 'Paused'} · {agent.lastRunStatus}
          </dd>
        </div>
        <div>
          <dt>Runs</dt>
          <dd>{agent.runCount}</dd>
        </div>
        <div>
          <dt>Reports to</dt>
          <dd>{manager?.agent.title ?? 'Team owner (you)'}</dd>
        </div>
      </dl>
      <Link
        to="/app/projects/$project/agents/$agent/{-$section}"
        params={{ project, agent: agentName(agent), section: 'definition' }}
      >
        Open agent definition
      </Link>
      <div className="team-prompt">
        <h3>
          <Code2 size={15} />
          Agent instructions
        </h3>
        <p>{agent.prompt}</p>
      </div>
    </section>
  );
}
