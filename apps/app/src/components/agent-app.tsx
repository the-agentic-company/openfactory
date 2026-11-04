import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { appBridgeRequestSchema as request } from '@openfactory/protocol/app-bridge';
import { readAgentApp, queryAgentApp, promptAgentApp } from '../server/agent-app';
import { VisualFrame } from './html-visualization';

export function AgentApp({ id, scope }: { id: string; scope: string }) {
  const client = useQueryClient();
  const app = useQuery({
    queryKey: ['agent-app', scope, id],
    queryFn: () => readAgentApp({ data: { id } }),
    refetchInterval: 3000,
  });
  const [source, setSource] = useState(false);
  const sending = useRef(false);
  const sentAt = useRef<number[]>([]);
  const [notice, setNotice] = useState('');
  const receive = useCallback(
    (data: unknown, reply: (message: unknown) => void, engaged: boolean) => {
      const parsed = request.safeParse(data);
      if (!parsed.success) {
        return;
      }
      const message = parsed.data;
      if (message.type === 'openfactory:database-query') {
        void queryAgentApp({ data: { id, statements: message.statements } }).then(
          (result) =>
            reply({
              type: 'openfactory:database-result',
              version: 1,
              requestId: message.requestId,
              ...result,
            }),
          (error: unknown) =>
            reply({
              type: 'openfactory:database-result',
              version: 1,
              requestId: message.requestId,
              error: error instanceof Error ? error.message : 'Query failed. Retry.',
            }),
        );
      } else {
        const replyPrompt = (status: 'sent' | 'rejected', error?: string) =>
          reply({
            type: 'openfactory:agent-prompt-result',
            version: 1,
            requestId: message.requestId,
            status,
            ...(error ? { error } : {}),
          });
        sentAt.current = sentAt.current.filter((time) => Date.now() - time < 60_000);
        if (
          !engaged ||
          sending.current ||
          sentAt.current.length >= 6 ||
          Date.now() - (sentAt.current.at(-1) ?? 0) < 1500
        ) {
          replyPrompt(
            'rejected',
            'Click the app again to send a request, or wait a moment if one is already sending.',
          );
          return;
        }
        sending.current = true;
        sentAt.current.push(Date.now());
        void promptAgentApp({ data: { id, prompt: message.prompt, requestId: message.requestId } })
          .then(
            () => {
              replyPrompt('sent');
              setNotice('Request sent. Your agent’s updates will appear here.');
              void client.invalidateQueries({ queryKey: ['agent-history', id] });
              void client.invalidateQueries({ queryKey: ['agents'] });
            },
            (error: unknown) => {
              const reason = error instanceof Error ? error.message : 'Could not send. Retry.';
              replyPrompt('rejected', reason);
              setNotice(reason);
            },
          )
          .finally(() => {
            sending.current = false;
          });
      }
    },
    [id, client],
  );
  if (app.isPending) {
    return <output>Loading agent app…</output>;
  }
  if (!app.data) {
    return (
      <div role="alert">
        <p>{app.error?.message ?? 'Unable to load the agent app.'}</p>
        <button className="button secondary" onClick={() => void app.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <>
      <section className="of-visual" aria-label="Agent app">
        <div className="of-visual-toolbar">
          <span>Agent app</span>
          <button type="button" aria-pressed={source} onClick={() => setSource(!source)}>
            {source ? 'Preview' : 'Source'}
          </button>
          <button type="button" onClick={() => void app.refetch()}>
            Refresh
          </button>
        </div>
        <div hidden={source}>
          <VisualFrame html={app.data.html} onMessage={receive} />
        </div>
        {source && (
          <textarea
            aria-label="Agent app source"
            readOnly
            spellCheck={false}
            value={app.data.html}
          />
        )}
        {app.error && <p role="alert">Updates paused: {app.error.message}</p>}
      </section>
      {notice && <output>{notice}</output>}
    </>
  );
}
