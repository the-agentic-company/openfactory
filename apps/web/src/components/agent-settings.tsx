import { scheduleLabel, type Agent } from '@openfactory/core';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Check, Copy, Folder } from 'lucide-react';
import { useState } from 'react';
import { getDeliveries } from '../server/agents';
import { agentDate as date, agentStateLabel as stateLabel } from './agent-display';
export function AgentSettings({ agent }: { agent: Agent }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const deliveries = useQuery({
    queryKey: ['deliveries', agent.id],
    queryFn: () => getDeliveries({ data: { id: agent.id } }),
    enabled: agent.schedule.type === 'webhook',
    refetchInterval: 10000,
  });
  return (
    <section className="agent-settings-page" aria-label="Agent settings">
      <span className="status good">{stateLabel(agent)}</span>
      <dl className="detail-facts">
        <div>
          <dt>Trigger</dt>
          <dd>{scheduleLabel(agent.schedule)}</dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd>
            {agent.modelSelection.instanceId} / {agent.modelSelection.model}
          </dd>
        </div>
        <div>
          <dt>Last dispatch</dt>
          <dd>{date(agent.lastRunAt)}</dd>
        </div>
        <div>
          <dt>Next trigger</dt>
          <dd>
            {agent.schedule.type === 'webhook' ? 'On incoming request' : date(agent.nextRunAt)}
          </dd>
        </div>
        <div>
          <dt>Total dispatches</dt>
          <dd>{agent.runCount}</dd>
        </div>
      </dl>
      <div className="workspace-detail">
        <Folder size={14} />
        <strong>{agent.projectName}</strong>
        <code>{agent.projectPath}</code>
      </div>
      <h3>Instructions</h3>
      <pre className="prompt-block">{agent.prompt}</pre>
      {agent.lastRunError && <p className="error-banner">{agent.lastRunError}</p>}
      {agent.threadId && (
        <a className="button primary" href={`t3-thread://v1/${agent.threadId}`}>
          Open agent conversation <ArrowUpRight size={14} />
        </a>
      )}
      <p className="detail-note">
        “Succeeded” means the runtime dispatched the run. Open the conversation for execution and
        results.
      </p>
      {agent.schedule.type === 'webhook' && (
        <>
          <h3>Webhook endpoint</h3>
          {agent.webhook?.url ? (
            <>
              <pre className="endpoint">{agent.webhook.url}</pre>
              <button
                className="button secondary"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(agent.webhook!.url!)
                    .then(() => setCopied(true))
                    .catch(() => setCopyError('Copy unavailable. Select the endpoint above.'));
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy endpoint'}
              </button>
              {copyError && <p role="alert">{copyError}</p>}
            </>
          ) : (
            <p>Enable T3 Connect remote access to get a public endpoint.</p>
          )}
          <p className="detail-note">
            {agent.webhook?.hasSecret
              ? 'Signature verification enabled.'
              : 'URL token authentication. Anyone with this URL can trigger the agent.'}
          </p>
          <h3>Recent webhook deliveries</h3>
          {deliveries.isError ? (
            <p role="alert">Could not load deliveries.</p>
          ) : deliveries.isPending ? (
            <p>Loading deliveries…</p>
          ) : deliveries.data.length === 0 ? (
            <p>No webhook deliveries yet.</p>
          ) : (
            deliveries.data.map((delivery) => (
              <div className="delivery" key={delivery.id}>
                <strong>
                  {delivery.method} · {delivery.outcome}
                </strong>
                <span>
                  {date(delivery.receivedAt)} · {delivery.bodyBytes} bytes
                </span>
                {delivery.error && <p>{delivery.error}</p>}
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}
