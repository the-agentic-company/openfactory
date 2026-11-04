import { Link } from '@tanstack/react-router';
import { projectName } from '../project-path';
import { ArrowUpRight } from 'lucide-react';
import { factoryMachine } from '../computer-workspaces';
import type { FactoriesData } from './all-factories';
import { machineName } from './factory-navigation';
import type { OverviewData, OpenOverviewFactory } from './overview-data';
import { overviewTimestamp as timestamp } from '../overview-model';
import { CheckCircle2, TriangleAlert } from 'lucide-react';

export function OverviewAttention({
  data,
  overview,
  go,
}: {
  data: FactoriesData;
  overview: OverviewData;
  go: OpenOverviewFactory;
}) {
  const { attention, loading, partial, offline, refreshing, refresh, failed, pulls } = overview;
  return (
    <section
      className="analytics-panel overview-attention"
      aria-labelledby="overview-attention-title"
    >
      <div className="analytics-panel-heading">
        <h2 id="overview-attention-title">Needs attention</h2>
        <span>
          {attention
            ? `${attention} ${attention === 1 ? 'item' : 'items'}`
            : loading
              ? 'Checking factories…'
              : partial
                ? 'Available data checked'
                : 'Up to date'}
        </span>
      </div>
      {offline.map(({ computer }) => (
        <div className="overview-attention-row" key={computer.id}>
          <TriangleAlert size={16} />
          <div>
            <strong>{machineName(data, computer.id)} is offline</strong>
            <small>Showing last loaded data. Reconnect the computer, then refresh.</small>
          </div>
          <button className="text-button" disabled={refreshing} onClick={refresh}>
            Retry
          </button>
        </div>
      ))}
      {data.groups
        .filter((group) => !factoryMachine(group))
        .map((group) => (
          <div className="overview-attention-row" key={group.key}>
            <TriangleAlert size={16} />
            <div>
              <strong>{group.title} needs a machine</strong>
              <small>No single machine is selected. Choose one in factory settings.</small>
            </div>
            <Link
              className="text-button"
              to="/app/projects/$project/settings"
              params={{
                project: projectName(group.instances[0]?.project.workspaceRoot ?? group.title),
              }}
              search={{ factory: group.key }}
            >
              Open settings <ArrowUpRight size={13} />
            </Link>
          </div>
        ))}
      {failed.slice(0, 3).map((run) => (
        <Attention
          key={run.key}
          title={`${run.group.title} · ${run.instance.agents.find((agent) => agent.id === run.agentId)?.title ?? run.title}`}
          detail={`Run failed · ${timestamp(run.requestedAt)}`}
          action="View run history"
          onClick={() =>
            go(
              run.group,
              'runs',
              run.instance,
              run.instance.agents.find((agent) => agent.id === run.agentId),
            )
          }
        />
      ))}
      {failed.length > 3 && (
        <p className="overview-panel-note">
          {failed.length - 3} more failed runs are listed in the factory histories.
        </p>
      )}
      {pulls.slice(0, 3).map((pull) => (
        <div className="overview-attention-row" key={pull.url}>
          <ArrowUpRight size={16} />
          <div>
            <a href={pull.url} target="_blank" rel="noreferrer">
              {pull.title}
            </a>
            <small>
              {pull.group.title} · #{pull.number} ·{' '}
              {pull.review === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Awaiting review'}
            </small>
          </div>
          <a className="text-button" href={pull.url} target="_blank" rel="noreferrer">
            Review<span className="overview-sr-only"> {pull.title}</span>
            <ArrowUpRight size={13} />
          </a>
        </div>
      ))}
      {pulls.length > 3 && (
        <p className="overview-panel-note">
          {pulls.length - 3} more pull requests await review in your factories.
        </p>
      )}
      {!attention && (
        <p className="overview-clear">
          <CheckCircle2 size={16} />
          {loading
            ? 'Checking recent runs and pull requests…'
            : partial
              ? 'No issues found in the available data.'
              : 'No failed runs, offline computers, or pull requests awaiting review.'}
        </p>
      )}
    </section>
  );
}
function Attention({
  title,
  detail,
  action,
  onClick,
}: {
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="overview-attention-row">
      <TriangleAlert size={16} />
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <button className="text-button" onClick={onClick}>
        {action}
        <ArrowUpRight size={13} />
      </button>
    </div>
  );
}
