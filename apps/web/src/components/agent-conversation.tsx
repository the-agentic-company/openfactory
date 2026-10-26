import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowUp, Bot, Clock3, MessageSquare, RefreshCw, Square } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { Agent, HistoryMessage } from '@openfactory/core';
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
function MarkdownText() {
  return <MarkdownTextPrimitive />;
}
function UserMessage() {
  return (
    <MessagePrimitive.Root className="chat-message user-message">
      <div className="message-author">You</div>
      <MessagePrimitive.Content components={{ Text: MarkdownText }} />
    </MessagePrimitive.Root>
  );
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="chat-message assistant-message">
      <div className="message-author">
        <Bot size={14} /> Assistant
      </div>
      <MessagePrimitive.Content components={{ Text: MarkdownText }} />
    </MessagePrimitive.Root>
  );
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
  const selected = query.data?.runs.find((run) => run.id === selectedId);
  const messages = selected?.messages ?? query.data?.messages ?? [];
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
      if (!query.data?.coordinatorId) {
        throw new Error('Run the agent first to create a conversation.');
      }
      const text = message.content
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n');
      await mutation.mutateAsync({
        id: agent.id,
        threadId: query.data.coordinatorId,
        text,
        requestId: crypto.randomUUID(),
      });
    },
    [agent.id, query.data, mutation],
  );
  const cancel = useMutation({
    mutationFn: () => {
      if (!query.data?.coordinatorId) {
        throw new Error('No live conversation.');
      }
      return stopAgentRun({
        data: { id: agent.id, threadId: query.data.coordinatorId, requestId: crypto.randomUUID() },
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
    isRunning: !selected && (query.data?.running || mutation.isPending),
    isDisabled: Boolean(selected) || !query.data?.coordinatorId,
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
        <button
          className={`history-row live-row ${selectedId === null ? 'selected' : ''}`}
          onClick={() => setSelectedId(null)}
        >
          <MessageSquare size={15} />
          <div>
            <strong>Live assistant</strong>
            <small>Current conversation</small>
          </div>
        </button>
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
            className={`history-row ${selectedId === run.id ? 'selected' : ''}`}
            key={run.id}
            onClick={() => setSelectedId(run.id)}
          >
            <Clock3 size={14} />
            <div>
              <strong>{run.title}</strong>
              <small>{timestamp(run.requestedAt)}</small>
              <span className={`run-status ${run.status}`}>{run.status}</span>
              <small>
                {run.source === 'codex_archive'
                  ? 'Imported Codex history'
                  : run.source === 'coordinator'
                    ? 'Shared coordinator'
                    : 'OpenFactory run'}
              </small>
            </div>
          </button>
        ))}
        {query.data?.truncated && (
          <p className="history-notice">
            Showing recent conversations and the latest 100 live messages.
          </p>
        )}
      </aside>
      <section className="assistant-pane" aria-label="Agent assistant">
        <div className="assistant-heading">
          <div>
            <h3>{selected?.title ?? 'Assistant'}</h3>
            <p>
              {selected
                ? `${selected.status} · ${timestamp(selected.requestedAt)}`
                : 'Continue the conversation.'}
            </p>
          </div>
          <span className="assistant-mode">
            <Activity size={13} />
            {selected ? 'Run transcript' : query.data?.running ? 'Working' : 'Live'}
          </span>
        </div>
        {selected?.source === 'codex_archive' && (
          <p className="archive-notice">
            Imported from your original Codex conversation. This transcript is read-only.
          </p>
        )}
        <AssistantRuntimeProvider runtime={runtime}>
          <ThreadPrimitive.Root className="assistant-thread">
            <ThreadPrimitive.Viewport
              className="assistant-viewport"
              autoScroll={!selected}
              scrollToBottomOnInitialize={!selected}
            >
              {messages.length === 0 && (
                <div className="chat-empty">
                  <Bot size={28} />
                  <h3>{selected ? 'No messages recorded' : 'Start a conversation'}</h3>
                  <p>
                    {selected
                      ? 'This run has no user or assistant text yet.'
                      : query.data?.coordinatorId
                        ? 'Ask a question or continue the work.'
                        : 'Run this agent once to create its conversation.'}
                  </p>
                </div>
              )}
              <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
              {!selected && query.data?.running && (
                <output className="chat-working">Agent is working…</output>
              )}
            </ThreadPrimitive.Viewport>
            {selected ? (
              <div className="transcript-footer">
                <span>Saved run transcript</span>
                <button className="button secondary" onClick={() => setSelectedId(null)}>
                  Continue with assistant <MessageSquare size={13} />
                </button>
              </div>
            ) : (
              <div className="chat-composer-wrap">
                {sendError && (
                  <p className="error-banner" role="alert">
                    {sendError}
                  </p>
                )}
                <ComposerPrimitive.Root className="chat-composer">
                  <ComposerPrimitive.Input
                    aria-label="Message your agent"
                    placeholder="Message your agent…"
                    rows={2}
                  />
                  {query.data?.running ? (
                    <ComposerPrimitive.Cancel className="chat-send" aria-label="Stop current run">
                      <Square size={15} />
                    </ComposerPrimitive.Cancel>
                  ) : (
                    <ComposerPrimitive.Send className="chat-send" aria-label="Send message">
                      <ArrowUp size={17} />
                    </ComposerPrimitive.Send>
                  )}
                </ComposerPrimitive.Root>
              </div>
            )}
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>
      </section>
    </div>
  );
}
