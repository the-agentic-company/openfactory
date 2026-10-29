import { WorkspacePage } from '../components/workspace-page';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { runBucket } from '@openfactory/core';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  GitPullRequest,
  Image,
  Link2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { ChatComposer, ChatThread } from '../components/assistant-chat';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { AgentGlyph } from '../components/agent-icon-picker';
import { RunStatusIcon } from '../components/run-list';
import { getAgents } from '../server/agents';
import { getRunByPath, getRunDetail, getRunImage, sendRunFollowup } from '../server/runs';
import { agentName, projectWorkspace } from '../project-path';
import { runPathParams } from '../run-path';

export const Route = createFileRoute(
  '/app_/projects/$project/threads/$thread/runs/$runId/{-$section}',
)({
  params: {
    parse: (params) => ({
      ...params,
      section: z
        .enum(['timeline', 'agents', 'scores', 'metadata'])
        .optional()
        .parse(params.section),
    }),
  },
  loader: async ({ params }) => {
    const [workspace, detail] = await Promise.all([
      getAgents(),
      getRunByPath({
        data: { project: params.project, thread: params.thread, runId: params.runId },
      }),
    ]);
    if (workspace.connected) {
      const workspaceRoot = projectWorkspace(params.project, workspace.projects);
      const project = workspace.projects.find((item) => item.workspaceRoot === workspaceRoot);
      if (detail.thread.projectId !== project?.id) {
        throw notFound();
      }
    }
    return { workspace, detail };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.detail.thread.title ?? 'Run'} — OpenFactory` }],
  }),
  component: RunPage,
  errorComponent: function RunError({ error }) {
    const { project } = Route.useParams();
    return (
      <WorkspacePage title="Run unavailable" contentClassName="runs-route-error">
        <Link to="/app/projects/$project/$view" params={{ project, view: 'runs' }}>
          <ArrowLeft size={15} />
          Back to runs
        </Link>
        <h1>Unable to load this run</h1>
        <p>
          {error instanceof Error
            ? error.message
            : 'The run could not be read. Return to the list and try again.'}
        </p>
      </WorkspacePage>
    );
  },
});
type Detail = Awaited<ReturnType<typeof getRunDetail>>;
const tabs = ['Timeline', 'Agents', 'Scores', 'Artifacts', 'Metadata'] as const;
const runSections = {
  Timeline: 'timeline',
  Agents: 'agents',
  Scores: 'scores',
  Artifacts: undefined,
  Metadata: 'metadata',
} as const;
function stamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function RunPage() {
  const initial = Route.useLoaderData();
  const client = useQueryClient();
  const { project, section } = Route.useParams();
  const runId = initial.detail.run.id;
  const thread = initial.detail.thread.id;
  const navigate = Route.useNavigate();
  const workspace = useQuery({
    queryKey: ['agents', 'workspace'],
    queryFn: () => getAgents(),
    initialData: initial.workspace,
    refetchInterval: 30000,
  });
  const query = useQuery({
    queryKey: ['run-detail', thread, runId],
    queryFn: () => getRunDetail({ data: { threadId: thread, runId } }),
    initialData: initial.detail,
    refetchInterval: 10000,
  });
  const detail = query.data;
  const tab = tabs.find((item) => runSections[item] === section) ?? 'Artifacts';
  function setTab(next: (typeof tabs)[number]) {
    void navigate({
      params: {
        ...runPathParams({ project, id: runId, threadId: thread }),
        section: runSections[next],
      },
    });
  }
  const [notice, setNotice] = useState('');
  const request = useRef<{ text: string; id: string } | null>(null);
  const agent = workspace.data.agents.find((item) => item.id === detail.agentId);
  const factory = workspace.data.projects.find((item) => item.id === detail.thread.projectId);
  const followup = useMutation({
    mutationFn: (data: { text: string; requestId: string }) =>
      sendRunFollowup({ data: { ...data, threadId: thread, runId } }),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ['factory-runs'] });
      void client.invalidateQueries({ queryKey: ['run-detail', thread, runId] });
      void client.invalidateQueries({ queryKey: ['agent-history'] });
      setNotice('');
      request.current = null;
      if (result.runId && result.runId !== runId) {
        void navigate({
          to: '/app/projects/$project/threads/$thread/runs/$runId/{-$section}',
          params: { ...runPathParams({ project, id: result.runId, threadId: thread }), section },
        });
      }
    },
    onError: (error) => setNotice(error.message),
  });
  const runtime = useExternalStoreRuntime({
    messages: detail.messages,
    convertMessage: (message): ThreadMessageLike => ({
      id: message.id,
      role: message.role,
      content: [{ type: 'text', text: message.text }],
      createdAt: new Date(message.createdAt),
    }),
    onNew: async (message) => {
      const text = message.content
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n');
      if (!text.trim()) {
        return;
      }
      if (request.current?.text !== text) {
        request.current = { text, id: crypto.randomUUID() };
      }
      await followup.mutateAsync({ text, requestId: request.current.id });
    },
    isRunning: followup.isPending,
  });
  const linkedAgents = workspace.data.agents.filter(
    (item) => item.id === detail.agentId || item.threadId === thread,
  );
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        agents={workspace.data.agents}
        projects={workspace.data.projects}
        activeProject={projectWorkspace(project, workspace.data.projects)}
        activeView="runs"
      />
      <div className="main-shell">
        <WorkspacePage
          layout="fill"
          contentClassName="single-run-page"
          project={factory}
          title={
            <>
              <Link to="/app/projects/$project/$view" params={{ project, view: 'runs' }}>
                Runs
              </Link>
              <ChevronRight size={14} />
              <span title={detail.thread.title}>{detail.thread.title}</span>
            </>
          }
        >
          {query.isError && (
            <p className="error-banner" role="alert">
              Could not refresh this run.{' '}
              <button onClick={() => void query.refetch()}>Retry</button>
            </p>
          )}
          <div className="run-workspace">
            <section className="run-conversation" aria-label="Run conversation">
              <header className="run-conversation-heading">
                <span className="run-conversation-agent">
                  <AgentGlyph
                    appearance={agent ? workspace.data.appearances[agent.id] : undefined}
                    size={18}
                  />
                  <strong>{agent?.title ?? 'Agent conversation'}</strong>
                </span>
                <span className="run-current-state">
                  <RunStatusIcon status={detail.run.status} />
                  {detail.run.status}
                </span>
                {detail.thread.nativeSessionId && (
                  <code title="Resume this session in your terminal">
                    {detail.thread.provider === 'codex' ? 'codex resume' : 'claude --resume'}{' '}
                    {detail.thread.nativeSessionId}
                  </code>
                )}
              </header>
              {detail.run.error && (
                <div className="error-banner" role="alert">
                  <p>{detail.run.error}</p>
                  {detail.run.capacityRetry?.status === 'pending' && (
                    <p>
                      Automatic continuation scheduled for{' '}
                      <time dateTime={detail.run.capacityRetry.at}>
                        {stamp(detail.run.capacityRetry.at)}
                      </time>
                      . You can also continue below now.
                    </p>
                  )}
                </div>
              )}
              <AssistantRuntimeProvider runtime={runtime}>
                <ChatThread
                  working={runBucket(detail.run.status) === 'running'}
                  emptyState={
                    !detail.messages.length && (
                      <p className="run-detail-empty">
                        No messages have been recorded for this run yet.
                      </p>
                    )
                  }
                  footer={
                    <div className="of-chat-composer-wrap">
                      <ChatComposer
                        placeholder="Continue this conversation…"
                        pending={followup.isPending}
                      />
                      {notice && <output className="of-chat-notice">{notice}</output>}
                    </div>
                  }
                />
              </AssistantRuntimeProvider>
              {detail.limited && (
                <p className="run-detail-notice">
                  Showing the latest messages. Full provider events are retained on the runtime
                  host.
                </p>
              )}
            </section>
            <aside className="run-detail-sidebar">
              <nav className="run-inspection-tabs" aria-label="Run details">
                {tabs.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={tab === item ? 'selected' : ''}
                    aria-pressed={tab === item}
                    onClick={() => setTab(item)}
                  >
                    {item}
                    {item === 'Scores' && detail.scores.length > 0 && (
                      <small>{detail.scores.length}</small>
                    )}
                  </button>
                ))}
              </nav>
              <div className="run-inspection-content">
                {tab === 'Timeline' && (
                  <div className="run-detail-timeline">
                    <TimelineEvent title="Run requested" at={detail.run.requestedAt} />
                    {detail.run.startedAt && (
                      <TimelineEvent title="Execution started" at={detail.run.startedAt} />
                    )}{' '}
                    {detail.messages.map((message) => (
                      <TimelineEvent
                        key={message.id}
                        title={message.role === 'user' ? 'Request received' : 'Assistant response'}
                        at={message.createdAt}
                      />
                    ))}
                    {detail.run.completedAt && (
                      <TimelineEvent
                        title={`Run ${detail.run.status}`}
                        at={detail.run.completedAt}
                      />
                    )}
                  </div>
                )}
                {tab === 'Agents' && (
                  <>
                    <h2>
                      Linked agents <span>{linkedAgents.length}</span>
                    </h2>
                    {linkedAgents.map((item) => (
                      <Link
                        key={item.id}
                        className="run-linked-agent"
                        to="/app/projects/$project/agents/$agent/{-$section}"
                        params={{ project, agent: agentName(item), section: undefined }}
                      >
                        <AgentGlyph appearance={workspace.data.appearances[item.id]} size={22} />
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.modelSelection.model}</small>
                        </span>
                        <ChevronRight size={14} />
                      </Link>
                    ))}
                    {!linkedAgents.length && (
                      <p className="run-detail-empty">
                        This run belongs to a project conversation, without a linked scheduled
                        agent.
                      </p>
                    )}
                    <p className="run-detail-hint">
                      Agents linked to this conversation. A shared conversation can serve more than
                      one agent.
                    </p>
                  </>
                )}
                {tab === 'Scores' && (
                  <>
                    <h2>
                      Output checks <span>{detail.scores.length}</span>
                    </h2>
                    {detail.scores.map((score) => (
                      <div key={score.id} className="run-score-result">
                        <span
                          className={
                            score.result === null
                              ? 'score-pending'
                              : score.result
                                ? 'score-pass'
                                : 'score-fail'
                          }
                        >
                          {score.result === null ? 'Pending' : score.result ? 'Pass' : 'Fail'}
                        </span>
                        <div>
                          <strong>{score.name}</strong>
                          <p>
                            {score.rule.type === 'min_length'
                              ? `At least ${score.rule.length} characters`
                              : `${score.rule.type === 'contains' ? 'Includes' : 'Excludes'} “${score.rule.text}”`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {!detail.scores.length && (
                      <p className="run-detail-empty">No scorers apply to this run.</p>
                    )}
                    <Link
                      className="text-button"
                      to="/app/projects/$project/$view"
                      params={{ project, view: 'scorers' }}
                    >
                      Manage scorers
                      <ArrowUpRight size={13} />
                    </Link>
                  </>
                )}
                {tab === 'Artifacts' && <RunArtifacts detail={detail} />}
                {tab === 'Metadata' && (
                  <>
                    <h2>Run metadata</h2>
                    <dl className="run-metadata-list">
                      {Object.entries({
                        Status: detail.run.status,
                        Model: detail.run.modelSelection?.model ?? 'Not recorded',
                        Provider: detail.run.modelSelection?.instanceId ?? 'Not recorded',
                        Source: detail.creationSource ?? 'Not recorded',
                        'Created by': detail.createdBy ?? 'Not recorded',
                        Requested: stamp(detail.run.requestedAt),
                        Started: detail.run.startedAt ? stamp(detail.run.startedAt) : 'Not started',
                        Completed: detail.run.completedAt
                          ? stamp(detail.run.completedAt)
                          : 'In progress',
                        Project: factory?.title ?? detail.project?.title ?? 'Unknown',
                        Workspace: detail.project?.workspaceRoot ?? 'Unknown',
                        'Run ID': detail.run.id,
                        'Conversation ID': thread,
                      }).map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </div>
            </aside>
          </div>
        </WorkspacePage>
      </div>
    </div>
  );
}
function TimelineEvent({ title, at }: { title: string; at: string }) {
  return (
    <div className="run-timeline-event">
      <span>
        <Check size={13} />
      </span>
      <div>
        <strong>{title}</strong>
        <time dateTime={at}>{stamp(at)}</time>
      </div>
    </div>
  );
}
function RunArtifacts({ detail }: { detail: Detail }) {
  const prs = detail.links.filter((link) => link.kind === 'pr');
  const links = detail.links.filter((link) => link.kind === 'link');
  return (
    <>
      <section className="run-artifact-section">
        <h2>
          <GitPullRequest size={15} />
          Pull requests<span>{prs.length}</span>
        </h2>
        {prs.map((link) => (
          <a
            key={link.url}
            className="run-artifact-card"
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            <span className="artifact-kind">
              Referenced PR
              <ArrowUpRight size={12} />
            </span>
            <strong>{link.label}</strong>
          </a>
        ))}
        {!prs.length && <p className="run-detail-empty">No pull requests linked in this run.</p>}
      </section>
      <section className="run-artifact-section">
        <h2>
          <Image size={15} />
          Attachments<span>{detail.attachments.length}</span>
        </h2>
        <div className="run-attachment-grid">
          {detail.attachments.map((item) => (
            <RunAttachment key={item.id} detail={detail} attachment={item} />
          ))}
        </div>
        {!detail.attachments.length && (
          <p className="run-detail-empty">No attachments in this run.</p>
        )}
      </section>
      <section className="run-artifact-section">
        <h2>
          <Link2 size={15} />
          Links<span>{links.length}</span>
        </h2>
        {links.map((link) => (
          <a
            key={link.url}
            className="run-artifact-link"
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            <Link2 size={14} />
            <span>{link.label}</span>
            <ArrowUpRight size={12} />
          </a>
        ))}
        {!links.length && <p className="run-detail-empty">No external links in this run.</p>}
      </section>
    </>
  );
}

function RunAttachment({
  detail,
  attachment,
}: {
  detail: Detail;
  attachment: Detail['attachments'][number];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const query = useQuery({
    queryKey: ['run-image', detail.run.id, attachment.id],
    queryFn: () =>
      getRunImage({
        data: { threadId: detail.thread.id, runId: detail.run.id, attachmentId: attachment.id },
      }),
    enabled: attachment.type === 'image',
    staleTime: 600000,
    retry: false,
  });
  return (
    <>
      <button
        type="button"
        className="run-attachment-card"
        aria-label={`Preview ${attachment.name}`}
        onClick={() => dialog.current?.showModal()}
        disabled={!query.data}
      >
        {query.data ? (
          <img
            className="run-attachment-thumbnail"
            src={query.data.dataUrl}
            alt={attachment.name}
          />
        ) : attachment.type === 'image' ? (
          <Image size={26} />
        ) : (
          <FileText size={26} />
        )}
        <strong>{attachment.name}</strong>
        <small>
          {query.isPending && attachment.type === 'image'
            ? 'Loading preview…'
            : query.isError
              ? 'Preview unavailable'
              : `${Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB · ${attachment.mimeType}`}
        </small>
      </button>
      <dialog ref={dialog} className="run-image-viewer" aria-label={attachment.name}>
        <div>
          <strong>{attachment.name}</strong>
          <button
            type="button"
            className="button secondary"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </div>
        {query.data && <img src={query.data.dataUrl} alt={attachment.name} />}
      </dialog>
    </>
  );
}
