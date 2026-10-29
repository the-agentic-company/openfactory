import { Select, SelectItem } from './ui/select';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { getAgentUsage } from '../server/agent-usage';
import './factory-dashboard.css';
import './agent-usage.css';

const number = (value: number) => value.toLocaleString();
const dollars = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function AgentUsage({ id }: { id: string }) {
  const [period, setPeriod] = useState(30);
  const [now] = useState(() => new Date());
  const first = new Date(now);
  first.setDate(first.getDate() - period + 1);
  const sinceDay = dateKey(first);
  const untilDay = dateKey(now);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const query = useQuery({
    queryKey: ['agent-usage', id, sinceDay, untilDay, timeZone],
    queryFn: () => getAgentUsage({ data: { id, sinceDay, untilDay, timeZone } }),
    refetchInterval: 60000,
    staleTime: 60000,
    retry: false,
  });
  const usage = query.data;
  const hasTokens = Boolean(usage?.records);
  const unavailable = query.isPending ? 'Loading…' : '—';
  return (
    <section
      className="analytics-dashboard agent-usage"
      aria-label="Agent usage statistics"
      aria-busy={query.isFetching}
    >
      <div className="agent-usage-heading">
        <h2>Usage & cost</h2>
        <div>
          <label htmlFor="agent-usage-select-1" className="analytics-period">
            <Select
              id="agent-usage-select-1"
              aria-label="Agent usage period"
              value={period}
              onValueChange={(value) => setPeriod(Number(value))}
            >
              <SelectItem value={7}>Last 7 days</SelectItem>
              <SelectItem value={30}>Last 30 days</SelectItem>
            </Select>
          </label>
          <button
            className="button secondary"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            aria-label="Refresh agent usage"
          >
            <RefreshCw size={14} className={query.isFetching ? 'spinning' : ''} />
          </button>
        </div>
      </div>
      {query.isError && (
        <p role="alert">Usage could not be loaded. {query.error.message} Use refresh to retry.</p>
      )}
      <div className="analytics-metrics">
        <div>
          <span>Tokens processed</span>
          <strong>{hasTokens && usage ? number(usage.total) : unavailable}</strong>
          <small>
            {hasTokens
              ? `${number(usage?.measuredTurns ?? 0)} measured provider turns`
              : 'No attributable token records'}
          </small>
        </div>
        <div>
          <span>Estimated API cost</span>
          <strong>
            {hasTokens && usage && usage.unpriced < usage.records
              ? dollars(usage.costUsd)
              : unavailable}
          </strong>
          <small>
            {usage?.unpriced
              ? `${number(usage.unpriced)} records without pricing`
              : 'USD · base API rates'}
          </small>
        </div>
        <div>
          <span>Total runs</span>
          <strong>{usage ? number(usage.runs) : unavailable}</strong>
          <small>Tagged agent runs in loaded history</small>
        </div>
        <div>
          <span>Completed runs</span>
          <strong>{usage ? number(usage.completed) : unavailable}</strong>
          <small>
            {usage
              ? `${number(usage.failed)} failed${usage.runs ? ` · ${Math.round((usage.completed / usage.runs) * 100)}% completed` : ''}`
              : 'Loading run outcomes…'}
          </small>
        </div>
      </div>
      {hasTokens && usage && (
        <dl className="agent-token-details">
          <div>
            <dt>Uncached input</dt>
            <dd>{number(usage.input)}</dd>
          </div>
          <div>
            <dt>Cached input</dt>
            <dd>{number(usage.cached)}</dd>
          </div>
          <div>
            <dt>Cache writes</dt>
            <dd>{number(usage.cacheWrite)}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>{number(usage.output)}</dd>
          </div>
          <div>
            <dt>
              Reasoning <small>(included in output)</small>
            </dt>
            <dd>{number(usage.reasoning)}</dd>
          </div>
        </dl>
      )}
      <p className="analytics-footnote">
        Only Codex turns explicitly tagged to this agent are counted. Shared coordinator turns,
        delegated work and archived runs are excluded. Cost estimates use the runtime’s cached model
        prices at base API rates; subscription charges and service-tier adjustments differ.
        {usage?.partial
          ? ' Coverage is incomplete: some history or transcripts could not be read.'
          : ''}
        {usage?.pricingAt
          ? ` Prices cached ${new Date(usage.pricingAt).toLocaleDateString()}.`
          : ''}
      </p>
    </section>
  );
}
