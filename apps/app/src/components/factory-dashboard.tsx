import { WorkspacePage } from './workspace-page';
import type { FactoryProject } from './factory-navigation-item';
import { Select, SelectItem } from './ui/select';
import type { Agent } from '@openfactory/core';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarDays, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { getFactoryRuns } from '../server/factory';
import { getTokenUsage } from '../server/usage';
import './factory-dashboard.css';

type Run = Awaited<ReturnType<typeof getFactoryRuns>>['runs'][number];
const completed = new Set(['completed', 'succeeded']);
const active = new Set(['preparing', 'queued', 'starting', 'running', 'waiting']);
const compact = (n: number) =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function FactoryDashboard({
  project,
  factory,
  status,
  runs,
  agents,
  loaded,
  refreshing,
  onRefresh,
  renderRuns,
}: {
  project: string;
  factory?: FactoryProject;
  status: ReactNode;
  runs: Run[];
  agents: Agent[];
  loaded: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  renderRuns: (runs: Run[]) => ReactNode;
}) {
  const [period, setPeriod] = useState(30);
  const [now] = useState(() => new Date());
  const days = Array.from({ length: period }, (_, i) => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - period + 1 + i);
    return day;
  });
  const sinceDay = dateKey(days[0] ?? now);
  const untilDay = dateKey(now);
  const usage = useQuery({
    queryKey: ['token-usage', project, sinceDay, untilDay],
    queryFn: () =>
      getTokenUsage({
        data: {
          project,
          sinceDay,
          untilDay,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: false,
  });
  const recent = runs.filter((r) => {
    const key = dateKey(new Date(r.requestedAt));
    return key >= sinceDay && key <= untilDay;
  });
  const buckets = usage.data?.buckets ?? [];
  const sources = usage.data?.sources ?? [];
  const hasUsage = sources.some((s) => s.status === 'ok' || s.status === 'partial');
  const partial = sources.some((s) => s.status !== 'ok');
  const input = buckets.reduce(
    (sum, b) => sum + b.totals.uncachedInputTokens + b.totals.cacheCreationTokens,
    0,
  );
  const cached = buckets.reduce((sum, b) => sum + b.totals.cachedInputTokens, 0);
  const output = buckets.reduce((sum, b) => sum + b.totals.outputTokens, 0);
  const total = input + cached + output;
  const success = recent.filter((r) => completed.has(r.status)).length;
  const running = recent.filter((r) => active.has(r.status)).length;
  const failures = recent.filter((r) => r.status === 'failed').length;
  const runSeries = days.map((d) => {
    const dayRuns = recent.filter((r) => dateKey(new Date(r.requestedAt)) === dateKey(d));
    return {
      day: d,
      values: [
        dayRuns.filter((r) => completed.has(r.status)).length,
        dayRuns.filter((r) => !completed.has(r.status) && r.status !== 'failed').length,
        dayRuns.filter((r) => r.status === 'failed').length,
      ],
    };
  });
  const tokenSeries = days.map((d) => {
    const dayBuckets = buckets.filter((b) => b.day === dateKey(d));
    return {
      day: d,
      values: [
        dayBuckets.reduce(
          (s, b) => s + b.totals.uncachedInputTokens + b.totals.cacheCreationTokens,
          0,
        ),
        dayBuckets.reduce((s, b) => s + b.totals.cachedInputTokens, 0),
        dayBuckets.reduce((s, b) => s + b.totals.outputTokens, 0),
      ],
    };
  });
  const topAgents = agents
    .map((agent) => ({
      label: agent.title,
      value: recent.filter((r) => r.agentId === agent.id).length,
    }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  const models = [...new Set(buckets.map((b) => b.model))]
    .map((model) => ({
      label: model,
      value: buckets
        .filter((b) => b.model === model)
        .reduce(
          (s, b) =>
            s +
            b.totals.uncachedInputTokens +
            b.totals.cacheCreationTokens +
            b.totals.cachedInputTokens +
            b.totals.outputTokens,
          0,
        ),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  return (
    <WorkspacePage
      project={factory}
      title="Dashboard"
      contentClassName="analytics-dashboard"
      actions={
        <div className="analytics-dashboard-actions">
          <label
            htmlFor="factory-dashboard-select-1"
            className="analytics-period analytics-dashboard-period"
          >
            <CalendarDays className="analytics-period-calendar" size={14} aria-hidden="true" />
            <Select
              id="factory-dashboard-select-1"
              aria-label="Dashboard period"
              value={period}
              onValueChange={(value) => setPeriod(Number(value))}
            >
              <SelectItem value={7}>Last 7 days</SelectItem>
              <SelectItem value={30}>Last 30 days</SelectItem>
            </Select>
          </label>
          <button
            className="button secondary"
            disabled={refreshing || usage.isFetching}
            onClick={() => {
              onRefresh();
              void usage.refetch();
            }}
          >
            <RefreshCw size={14} className={refreshing || usage.isFetching ? 'spinning' : ''} />{' '}
            Reload
          </button>
        </div>
      }
    >
      {status}
      <div className="analytics-metrics">
        <Metric
          label="Tokens processed"
          value={hasUsage ? compact(total) : '—'}
          note={
            hasUsage
              ? `${partial ? 'Partial coverage · ' : ''}Factory agent runs`
              : usage.isPending
                ? 'Loading factory usage…'
                : 'Factory usage unavailable'
          }
        />
        <Metric
          label="Total runs"
          value={loaded ? recent.length.toLocaleString() : '—'}
          note="In loaded factory history"
        />
        <Metric
          label="Completed runs"
          value={loaded ? success.toLocaleString() : '—'}
          note={
            recent.length
              ? `${Math.round((success / recent.length) * 100)}% of recorded runs`
              : 'No runs in this period'
          }
        />
        <Metric
          label="Enabled agents"
          value={agents.filter((a) => a.enabled).length.toLocaleString()}
          note={`${agents.length} agents · ${running} runs in progress`}
        />
      </div>
      <div className="analytics-chart-grid">
        <section className="analytics-panel">
          <PanelHeading title="Run activity" detail="Loaded factory history" />
          {loaded ? (
            <BarChart
              series={runSeries}
              labels={['Completed', 'Other / in progress', 'Failed']}
              palette="runs"
            />
          ) : (
            <div className="analytics-chart-empty">Loading run activity…</div>
          )}
          <div className="analytics-panel-footer">
            <span>{success} completed</span>
            <span>
              {failures} failed · {running} in progress
            </span>
          </div>
        </section>
        <section className="analytics-panel">
          <PanelHeading title="Token usage" detail="Selected factory’s agent runs" />
          {hasUsage ? (
            <BarChart
              series={tokenSeries}
              labels={['Input', 'Cached input', 'Output']}
              palette="tokens"
            />
          ) : (
            <div className="analytics-chart-empty">
              <span>{usage.isPending ? 'Loading token usage…' : 'Token usage is unavailable'}</span>
              <small>
                {usage.isPending
                  ? 'Reading usage for this factory’s agent runs.'
                  : 'Usage could not be attributed to this factory’s agent runs.'}
              </small>
              {usage.isError && (
                <button className="text-button" onClick={() => void usage.refetch()}>
                  Retry usage <ArrowUpRight size={13} />
                </button>
              )}
            </div>
          )}
          <div className="analytics-panel-footer">
            <span>
              {hasUsage ? `${compact(input + cached)} input tokens` : 'Provider-reported tokens'}
            </span>
            <span>{hasUsage ? `${compact(output)} output tokens` : 'No estimates'}</span>
          </div>
        </section>
      </div>
      <div className="analytics-breakdowns">
        <Breakdown
          title="Most active agents"
          rows={topAgents}
          empty="No agent runs in this period."
          color="orange"
        />
        <Breakdown
          title="Run outcomes"
          rows={
            loaded
              ? [
                  { label: 'Completed', value: success },
                  { label: 'In progress', value: running },
                  { label: 'Failed', value: failures },
                  { label: 'Other', value: recent.length - success - running - failures },
                ]
              : []
          }
          empty="Loading outcomes…"
          color="green"
        />
        <Breakdown
          title="Tokens by model"
          rows={models}
          empty={
            hasUsage ? 'No tokens recorded in this period.' : 'Waiting for factory usage data.'
          }
          color="blue"
        />
      </div>
      <section className="analytics-panel analytics-latest">
        <PanelHeading title="Latest runs" detail={`${recent.length} recorded in this period`} />
        {loaded && renderRuns(recent.slice(0, 5))}
      </section>
    </WorkspacePage>
  );
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function PanelHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="analytics-panel-heading">
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  );
}
function Breakdown({
  title,
  rows,
  empty,
  color,
}: {
  title: string;
  rows: { label: string; value: number }[];
  empty: string;
  color: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className={`analytics-panel analytics-breakdown ${color}`}>
      <h2>{title}</h2>
      <div>
        {rows.length ? (
          rows.map((row) => (
            <div className="analytics-rank" key={row.label}>
              <div>
                <span title={row.label}>{row.label}</span>
                <span>{compact(row.value)}</span>
              </div>
              <div className="analytics-track">
                <span style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="analytics-empty-copy">{empty}</p>
        )}
      </div>
    </section>
  );
}
function BarChart({
  series,
  labels,
  palette,
}: {
  series: { day: Date; values: number[] }[];
  labels: string[];
  palette: string;
}) {
  const peak = Math.max(1, ...series.map((s) => s.values.reduce((a, b) => a + b, 0)));
  const max = Math.ceil(peak / 4) * 4;
  const step = 500 / series.length;
  return (
    <div className={`analytics-chart ${palette}`}>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG charts require an accessible image role. */}
      <svg viewBox="0 0 570 230" role="img" aria-label={`${labels.join(', ')} by day`}>
        <title>
          {series
            .map(
              (s) =>
                `${s.day.toLocaleDateString()}: ${s.values.map((v, i) => `${labels[i]} ${v}`).join(', ')}`,
            )
            .join('; ')}
        </title>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={48} x2={550} y1={20 + i * 40} y2={20 + i * 40} />
            <text x={38} y={24 + i * 40} textAnchor="end">
              {compact((max * (4 - i)) / 4)}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          let offset = 0;
          return (
            <g key={dateKey(s.day)}>
              {s.values.map((v, j) => {
                const height = (v / max) * 160;
                offset += height;
                return (
                  <rect
                    key={labels[j]}
                    className={`series-${j}`}
                    x={52 + i * step}
                    y={180 - offset}
                    width={Math.max(3, step - 5)}
                    height={height}
                    rx={1}
                  >
                    <title>
                      {s.day.toLocaleDateString()}: {labels[j]} {v.toLocaleString()}
                    </title>
                  </rect>
                );
              })}
              {(i % Math.ceil(series.length / 5) === 0 || i === series.length - 1) && (
                <text x={52 + i * step + step / 2} y={207} textAnchor="middle">
                  {s.day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="analytics-legend">
        {labels.map((label, i) => (
          <span key={label}>
            <i className={`series-${i}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
