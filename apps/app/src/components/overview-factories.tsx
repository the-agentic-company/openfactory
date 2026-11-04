import { ArrowUpRight } from 'lucide-react';
import { factoryMachine } from '../computer-workspaces';
import type { FactoriesData } from './all-factories';
import { machineName } from './factory-navigation';
import type { OverviewData, OpenOverviewFactory } from './overview-data';
import { overviewNumber as compact, overviewTimestamp as timestamp } from '../overview-model';
import { summarizeRuns } from '../overview-model';
import { AppearanceGlyph } from './appearance-glyph';

export function OverviewFactories({
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
  const { sources, results, uniqueRuns, sinceDay, untilDay, loading } = overview;
  return (
    <section
      className="analytics-panel overview-factories"
      aria-labelledby="overview-factories-title"
    >
      <div className="analytics-panel-heading">
        <h2 id="overview-factories-title">Factories</h2>
        <span>Activity for the selected period</span>
      </div>
      <section className="overview-table-scroll" aria-label="Factory activity">
        <table className="overview-data-table">
          <thead>
            <tr>
              <th scope="col">Factory</th>
              <th scope="col">Agents</th>
              <th scope="col">Running</th>
              <th scope="col">Failed</th>
              <th scope="col">Tokens</th>
              <th scope="col">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map((group) => {
              const machine = factoryMachine(group);
              const indices = sources.flatMap((source, index) =>
                source.group.key === group.key ? [index] : [],
              );
              const snapshots = indices.flatMap((index) =>
                results[index]?.data ? [results[index].data] : [],
              );
              const groupRuns = uniqueRuns.filter((run) => run.group.key === group.key);
              const counts = summarizeRuns(groupRuns, sinceDay, untilDay);
              const groupUsage = snapshots.flatMap((snapshot) =>
                snapshot.usage ? [snapshot.usage] : [],
              );
              const measured = groupUsage.some((entry) =>
                entry.sources.some((source) => source.status !== 'missing'),
              );
              const tokenCount = groupUsage.reduce(
                (sum, entry) =>
                  sum +
                  entry.buckets
                    .filter((bucket) => bucket.day >= sinceDay && bucket.day <= untilDay)
                    .reduce(
                      (count, bucket) =>
                        count + Object.values(bucket.totals).reduce((a, b) => a + b, 0),
                      0,
                    ),
                0,
              );
              const latest = groupRuns
                .map((run) => run.requestedAt)
                .sort()
                .at(-1);
              const stale = indices.some(
                (index) =>
                  results[index]?.isError ||
                  data.workspaces[
                    data.computers.findIndex(
                      (computer) => computer.id === sources[index]?.instance.computerId,
                    )
                  ]?.isError,
              );
              const savedAt = snapshots.map((snapshot) => snapshot.savedAt).sort()[0];
              return (
                <tr key={group.key}>
                  <th scope="row">
                    <button
                      className="overview-factory-button"
                      disabled={pending}
                      onClick={() => go(group, 'dashboard')}
                    >
                      <AppearanceGlyph
                        appearance={
                          machine?.icon ??
                          group.instances[0]?.icon ?? {
                            kind: 'icon',
                            name: 'factory',
                            color: 'gray',
                          }
                        }
                        size={20}
                      />
                      <span>
                        <strong>{group.title}</strong>
                        <small>
                          {stale
                            ? `Offline · ${savedAt ? `last updated ${timestamp(savedAt)}` : 'showing last loaded data'}`
                            : !machine
                              ? 'Choose a machine'
                              : machineName(data, machine.computerId)}
                        </small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  </th>
                  <td>
                    {machine ? (
                      <button
                        className="text-button"
                        onClick={() => go(group, 'agents')}
                        disabled={pending}
                      >
                        {machine.agents.length}
                        <span className="overview-sr-only"> agents in {group.title}</span>
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {snapshots.some((snapshot) => snapshot.historyLoaded) ? counts.running : '—'}
                  </td>
                  <td>
                    <button
                      className={`text-button ${counts.failed ? 'overview-failed' : ''}`}
                      onClick={() =>
                        go(
                          group,
                          'runs',
                          groupRuns.find((run) => run.status === 'failed')?.instance,
                        )
                      }
                      disabled={pending}
                    >
                      {snapshots.some((snapshot) => snapshot.historyLoaded) ? counts.failed : '—'}
                      <span className="overview-sr-only"> failed runs in {group.title}</span>
                    </button>
                  </td>
                  <td>{measured ? compact(tokenCount) : '—'}</td>
                  <td>
                    {latest ? (
                      <time dateTime={latest}>{timestamp(latest)}</time>
                    ) : snapshots.some((snapshot) => snapshot.historyLoaded) ? (
                      'No recorded runs'
                    ) : loading ? (
                      'Loading…'
                    ) : (
                      'Unavailable'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {data.groups.length === 0 && (
        <p className="overview-panel-note">
          {loading
            ? 'Loading factories…'
            : 'Factories are unavailable. Reconnect a computer, then refresh.'}
        </p>
      )}
    </section>
  );
}
