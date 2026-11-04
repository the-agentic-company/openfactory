import { ArrowUpRight } from 'lucide-react';
import type { FactoriesData } from './all-factories';
import { machineName } from './factory-navigation';
import type { OverviewData, OpenOverviewFactory } from './overview-data';
import { overviewTimestamp as timestamp } from '../overview-model';

export function OverviewRecentRuns({
  data,
  overview,
  go,
  pending,
}: {
  data: FactoriesData;
  overview: OverviewData;
  go: OpenOverviewFactory;
  pending: boolean;
}) {
  const { recent, loading, loaded } = overview;
  return (
    <section className="analytics-panel" aria-labelledby="overview-recent-title">
      <div className="analytics-panel-heading">
        <h2 id="overview-recent-title">Recent runs</h2>
        <span>Across all factories</span>
      </div>
      {recent.slice(0, 8).map((run) => (
        <button
          className="overview-run"
          key={run.key}
          disabled={pending}
          onClick={() =>
            go(
              run.group,
              'runs',
              run.instance,
              run.instance.agents.find((agent) => agent.id === run.agentId),
            )
          }
        >
          <span
            className={`overview-run-status ${run.status === 'failed' ? 'overview-failed' : ''}`}
          >
            {run.status}
          </span>
          <span>
            <strong>
              {run.instance.agents.find((agent) => agent.id === run.agentId)?.title ?? run.title}
            </strong>
            <small>
              {run.group.title} · {machineName(data, run.instance.computerId)}
            </small>
          </span>
          <time dateTime={run.requestedAt}>{timestamp(run.requestedAt)}</time>
          <ArrowUpRight size={14} />
        </button>
      ))}
      {!recent.length && (
        <p className="overview-panel-note">
          {loading
            ? 'Loading recent runs…'
            : loaded
              ? 'No recorded runs in this period.'
              : 'Run history is unavailable. Refresh to retry.'}
        </p>
      )}
    </section>
  );
}
export function OverviewCoverage({
  data,
  overview,
}: {
  data: FactoriesData;
  overview: OverviewData;
}) {
  const { sources, results } = overview;
  return (
    <details className="overview-coverage">
      <summary>Some data is unavailable or incomplete</summary>
      <p>
        Totals include only loaded history and reported usage. Offline computers show their last
        saved values.
      </p>
      {sources.map(({ group, instance }, index) => {
        const result = results[index];
        const issues = [
          ...(result?.data?.issues ?? []),
          ...(result?.isError ? ['Could not refresh. Showing saved data when available.'] : []),
          ...(result?.data?.limited ? ['Run history is truncated.'] : []),
          ...(result?.data &&
          (result.data.sinceDay > overview.sinceDay || result.data.untilDay < overview.untilDay)
            ? ['Saved usage covers only part of the selected period.']
            : []),
          ...(result?.data?.usage?.sources.some((source) => source.status !== 'ok')
            ? ['Token usage is incomplete.']
            : []),
          ...(result?.data?.pulls?.unavailable ?? []),
          ...(result?.data?.pulls?.limited ? ['Pull request results are limited.'] : []),
        ];
        return issues.length ? (
          <p key={`${group.key}:${instance.computerId}:${instance.project.id}`}>
            <strong>
              {group.title} · {machineName(data, instance.computerId)}
            </strong>
            <br />
            {issues.join(' ')}
          </p>
        ) : null;
      })}
    </details>
  );
}
