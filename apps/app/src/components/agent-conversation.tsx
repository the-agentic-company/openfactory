import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Clock3, MessageSquare, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { Agent, HistoryMessage } from '@openfactory/core';
import { ChatComposer, ChatThread } from './assistant-chat';
import { getAgentHistory, sendAgentMessage, stopAgentRun } from '../server/history';

const convertMessage = (message: HistoryMessage): ThreadMessageLike => ({
  id: message.id,
  role: message.role,
  content: [{ type: 'text', text: message.text }],
  createdAt: new Date(message.createdAt),
});
function timestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export function AgentConversation({ agent }: { agent: Agent }) {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sendError, setSendError] = useState('');
  const query = useQuery({
    queryKey: ['agent-history', agent.id],
    queryFn: () => getAgentHistory({ data: { id: agent.id } }),
    refetchInterval: 5000,
  });
  const latest = query.data?.runs.find((run) => run.source === 'openfactory');
  const selected =
    query.data?.runs.find((run) => run.id === selectedId) ?? latest ?? query.data?.runs[0];
  const messages = selected?.messages ?? [];
  const readOnly = !selected || selected.source !== 'openfactory' || selected.id !== latest?.id;
  const running = Boolean(
    selected && ['preparing', 'queued', 'starting', 'running', 'waiting'].includes(selected.status),
  );
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof sendAgentMessage>[0]['data']) =>
      sendAgentMessage({ data }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['agent-history', agent.id] });
      setSendError('');
    },
    onError: (error) => setSendError(`${error.message} Check live history before retrying.`),
  });
  const onNew = useCallback(
    async (message: AppendMessage) => {
      if (!selected || readOnly) {
        throw new Error('Run the agent first to create a conversation.');
      }
      const text = message.content
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n');
      await mutation.mutateAsync({
        id: agent.id,
        threadId: selected.threadId,
        runId: selected.id,
        text,
        requestId: crypto.randomUUID(),
      });
    },
    [agent.id, selected, readOnly, mutation],
  );
  const cancel = useMutation({
    mutationFn: () => {
      if (!selected || readOnly) {
        throw new Error('No live conversation.');
      }
      return stopAgentRun({
        data: { id: agent.id, threadId: selected.threadId, requestId: crypto.randomUUID() },
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['agent-history', agent.id] });
    },
    onError: (error) => setSendError(error.message),
  });
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage,
    onNew,
    onCancel: () => cancel.mutateAsync().then(() => undefined),
    isRunning: !readOnly && (running || mutation.isPending),
    isDisabled: readOnly,
  });
  return (
    <div className="conversation-layout">
      <aside className="run-sidebar" aria-label="Previous runs">
        <div className="run-sidebar-title">
          <h3>Previous runs</h3>
          <button
            className="icon-button"
            aria-label="Refresh run history"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {query.isPending && <p className="history-notice">Loading previous runs…</p>}
        {query.isError && (
          <p role="alert" className="error-banner">
            Could not load runs. Refresh to retry.
          </p>
        )}
        {query.data?.runs.length === 0 && (
          <p className="history-notice">No runs yet. Use Run now to start this agent.</p>
        )}
        {query.data?.runs.map((run) => (
          <button
            className={`history-row ${selected?.id === run.id ? 'selected' : ''}`}
            key={run.id}
            onClick={() => setSelectedId(run.id)}
          >
            <Clock3 size={14} />
            <div>
              <strong>{run.title}</strong>
              <small>{timestamp(run.requestedAt)}</small>
              <span className={`run-status ${run.status}`}>{run.status}</span>
            </div>
          </button>
        ))}
        {query.data?.truncated && (
          <p className="history-notice">Showing recent run conversations.</p>
        )}
      </aside>
      <section className="assistant-pane" aria-label="Agent assistant">
        <div className="assistant-heading">
          <div>
            <h3>{selected?.title ?? 'Assistant'}</h3>
            {selected && (
              <p>
                {selected.status} · {timestamp(selected.requestedAt)}
              </p>
            )}
          </div>
          <span className="assistant-mode">
            <Activity size={13} />
            {running ? 'Working' : readOnly ? 'Run transcript' : 'Latest run'}
          </span>
        </div>
        {selected?.source === 'codex_archive' && (
          <p className="archive-notice">
            Imported from your original Codex conversation. This transcript is read-only.
          </p>
        )}
        <AssistantRuntimeProvider runtime={runtime}>
          <ChatThread
            key={selected?.id ?? 'empty'}
            readOnly={readOnly}
            working={running}
            emptyState={
              messages.length === 0 && (
                <div className="chat-empty">
                  <img src="/openfactory.png" alt="" width={48} height={48} />
                  <h3>{selected ? 'No messages recorded' : 'Start a conversation'}</h3>
                  <p>
                    {selected
                      ? 'This run has no user or assistant text yet.'
                      : 'Run this agent once to create its conversation.'}
                  </p>
                </div>
              )
            }
            footer={
              readOnly ? (
                <div className="transcript-footer">
                  <span>Saved run transcript</span>
                  {latest && (
                    <button className="button secondary" onClick={() => setSelectedId(latest.id)}>
                      Open latest run <MessageSquare size={13} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="chat-composer-wrap">
                  {sendError && (
                    <p className="error-banner" role="alert">
                      {sendError}
                    </p>
                  )}
                  <ChatComposer
                    running={running || cancel.isPending}
                    pending={mutation.isPending}
                  />
                </div>
              )
            }
          />
        </AssistantRuntimeProvider>
      </section>
    </div>
  );
}
