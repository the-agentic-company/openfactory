import type { WorkspaceView } from '@openfactory/core';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { factoryMachine, type FactoryGroup } from '../computer-workspaces';
import { overviewNumber as compact } from '../overview-model';
import type { FactoriesData } from './all-factories';
import { useOpenComputerFactory } from './factory-navigation';
import { WorkspacePage } from './workspace-page';
import { Select, SelectItem } from './ui/select';
import { BarChart } from './factory-dashboard';
import './overview-dashboard.css';
import { useOverviewData } from './overview-data';
import { OverviewAttention } from './overview-attention';
import { OverviewFactories } from './overview-factories';
import { OverviewRecentRuns, OverviewCoverage } from './overview-history';

export function OverviewDashboard({
  data,
  onCreate,
}: {
  data: FactoriesData;
  onCreate: () => void;
}) {
  const [period, setPeriod] = useState<7 | 30>(7);
  const overview = useOverviewData(data, period);
  const { totals, loaded, loading, refreshing, partial, chart, refresh, hasUsage, tokens } =
    overview;
  const open = useOpenComputerFactory();
  function go(
    group: FactoryGroup,
    view: WorkspaceView,
    instance = factoryMachine(group) ?? group.instances[0],
    agent?: { id: string; title: string },
  ) {
    if (instance && !open.isPending) {
      open.mutate({
        computerId: instance.computerId,
        workspaceRoot: instance.project.workspaceRoot,
        view,
        agent: agent ? { ...agent, section: 'runs' } : undefined,
      });
    }
  }
  return (
    <WorkspacePage
      title="Overview"
      contentClassName="analytics-dashboard overview-dashboard"
      actions={
        <>
          <label className="analytics-period analytics-dashboard-period" htmlFor="overview-period">
            <CalendarDays size={14} className="analytics-period-calendar" aria-hidden="true" />
            <Select
              id="overview-period"
              aria-label="Overview period"
              value={period}
              onValueChange={(value) => setPeriod(Number(value) === 30 ? 30 : 7)}
            >
              <SelectItem value={7}>Last 7 days</SelectItem>
              <SelectItem value={30}>Last 30 days</SelectItem>
            </Select>
          </label>
          <button className="button secondary" disabled={refreshing} onClick={refresh}>
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
            Refresh
          </button>
          <button className="button primary" onClick={onCreate}>
            Create agent
          </button>
        </>
      }
    >
      <p className="overview-summary">
        {data.groups.length} {data.groups.length === 1 ? 'factory' : 'factories'} · Across all
        computers{partial && ' · Some data is unavailable or incomplete'}
      </p>
      {data.settings.error && (
        <p className="error-banner" role="alert">
          Could not load computers. {data.settings.error.message}
        </p>
      )}
      {open.error && (
        <p className="error-banner" role="alert">
          {open.error.message}
        </p>
      )}
      {data.groups.length === 0 &&
      !loading &&
      !data.settings.isError &&
      !data.workspaces.some((result) => result.isError) ? (
        <section className="empty-state">
          <h2>Your factories start here</h2>
          <p>Create an agent and choose its working directory to start a factory.</p>
          <button className="button primary" onClick={onCreate}>
            Create agent
          </button>
        </section>
      ) : (
        <>
          <div className="analytics-metrics">
            <Metric
              label="Running now"
              value={loaded ? totals.running : null}
              note="Across loaded run history"
            />
            <Metric
              label="Completed"
              value={loaded ? totals.completed : null}
              note={`In the last ${period} days`}
            />
            <Metric
              label="Failed"
              value={loaded ? totals.failed : null}
              note={`In the last ${period} days`}
            />
            <Metric
              label="Tokens processed"
              value={hasUsage ? compact(tokens) : null}
              note={
                hasUsage
                  ? 'Reported usage in this period'
                  : loading
                    ? 'Loading reported usage…'
                    : 'Usage unavailable'
              }
            />
          </div>
          <OverviewAttention data={data} overview={overview} go={go} />
          <OverviewFactories data={data} overview={overview} go={go} pending={open.isPending} />
          <section
            className="analytics-panel overview-activity"
            aria-labelledby="overview-activity-title"
          >
            <div className="analytics-panel-heading">
              <h2 id="overview-activity-title">Run activity</h2>
              <span>All factories · Last {period} days</span>
            </div>
            {loaded ? (
              <BarChart
                series={chart}
                labels={['Completed', 'Other / in progress', 'Failed']}
                palette="runs"
              />
            ) : (
              <p className="overview-panel-note">
                {loading
                  ? 'Loading run activity…'
                  : 'Run history is unavailable. Refresh to retry.'}
              </p>
            )}
          </section>
          <OverviewRecentRuns data={data} overview={overview} go={go} pending={open.isPending} />
          {partial && <OverviewCoverage data={data} overview={overview} />}
        </>
      )}
    </WorkspacePage>
  );
}
function Metric({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
      <small>{note}</small>
    </div>
  );
}
