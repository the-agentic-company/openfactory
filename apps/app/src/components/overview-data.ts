import { useQueries, useQuery } from '@tanstack/react-query';
import { factoryOverviewSchema } from '@openfactory/client';
import { getComputerFactoryOverview } from '../server/computer-workspaces';
import { factoryMachine } from '../computer-workspaces';
import { summarizeRuns, overviewDay } from '../overview-model';
import type { FactoriesData } from './all-factories';
import { native } from './computer-connections';

export function useOverviewData(data: FactoriesData, period: 7 | 30) {
  const clock = useQuery({
    queryKey: ['overview-clock'],
    queryFn: () => new Date().toISOString(),
    initialData: () => new Date().toISOString(),
    refetchInterval: 60000,
    staleTime: 60000,
  });
  const now = new Date(clock.data);
  const days = Array.from({ length: period }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - period + index + 1);
    return date;
  });
  const sinceDay = overviewDay(days[0] ?? now);
  const untilDay = overviewDay(now);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sources = data.groups.flatMap((group) =>
    group.instances.map((instance) => ({ group, instance })),
  );
  const results = useQueries({
    queries: sources.map(({ instance }) => {
      const origin = data.computers.find((computer) => computer.id === instance.computerId)?.origin;
      const queryKey = [
        'factory-overview',
        instance.computerId,
        origin,
        instance.project.id,
        sinceDay,
        untilDay,
        timeZone,
        period,
      ];
      const storageKey = JSON.stringify([
        'factory-overview-saved',
        instance.computerId,
        origin,
        instance.project.id,
      ]);
      return {
        queryKey,
        queryFn: async () => {
          const input = {
            project: instance.project.id,
            sinceDay,
            untilDay,
            timeZone,
            days: period,
          };
          const api = native();
          const overview = factoryOverviewSchema.parse(
            api
              ? await api.invoke('factory-overview', {
                  computerId: instance.computerId,
                  data: input,
                })
              : await getComputerFactoryOverview({
                  data: { ...input, computerId: instance.computerId },
                }),
          );
          try {
            localStorage.setItem(storageKey, JSON.stringify(overview));
          } catch {
            /* Live reads work without storage. */
          }
          return overview;
        },
        initialData: () => {
          if (typeof window === 'undefined') {
            return undefined;
          }
          try {
            const parsed = factoryOverviewSchema.safeParse(
              JSON.parse(localStorage.getItem(storageKey) ?? 'null'),
            );
            return parsed.success ? parsed.data : undefined;
          } catch {
            return undefined;
          }
        },
        initialDataUpdatedAt: 0,
        staleTime: 60000,
        refetchInterval: 60000,
        retry: false,
      };
    }),
  });
  const loaded = results.some((result) => result.data?.historyLoaded);
  const loading =
    data.settings.isPending ||
    data.workspaces.some((result) => result.isPending) ||
    results.some((result) => result.isPending);
  const refreshing =
    data.settings.isFetching ||
    data.workspaces.some((result) => result.isFetching) ||
    results.some((result) => result.isFetching);
  const runs = sources.flatMap(({ group, instance }, index) =>
    (results[index]?.data?.runs ?? []).map((run) => ({
      ...run,
      group,
      instance,
      key: JSON.stringify([instance.computerId, run.id]),
    })),
  );
  const uniqueRuns = [...new Map(runs.map((run) => [run.key, run])).values()];
  const recent = uniqueRuns
    .filter(
      (run) =>
        overviewDay(new Date(run.requestedAt)) >= sinceDay &&
        overviewDay(new Date(run.requestedAt)) <= untilDay,
    )
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const totals = summarizeRuns(uniqueRuns, sinceDay, untilDay);
  const usage = results.flatMap((result) => (result.data?.usage ? [result.data.usage] : []));
  const hasUsage = usage.some((entry) =>
    entry.sources.some((source) => source.status !== 'missing'),
  );
  const tokens = usage.reduce(
    (sum, entry) =>
      sum +
      entry.buckets
        .filter((bucket) => bucket.day >= sinceDay && bucket.day <= untilDay)
        .reduce(
          (count, bucket) => count + Object.values(bucket.totals).reduce((a, b) => a + b, 0),
          0,
        ),
    0,
  );
  const partial =
    results.some(
      (result) =>
        !result.data ||
        result.isError ||
        result.data.issues.length > 0 ||
        result.data.limited ||
        result.data.sinceDay > sinceDay ||
        result.data.untilDay < untilDay ||
        result.data.usage?.sources.some((source) => source.status !== 'ok') ||
        result.data.pulls?.unavailable.length ||
        result.data.pulls?.limited,
    ) || data.workspaces.some((result) => result.isError);
  const offline = data.computers.flatMap((computer, index) =>
    data.workspaces[index]?.isError ? [{ computer, result: data.workspaces[index] }] : [],
  );
  const failed = recent.filter((run) => run.status === 'failed');
  const pulls = [
    ...new Map(
      sources
        .flatMap(({ group, instance }, index) =>
          (results[index]?.data?.pulls?.pulls ?? [])
            .filter((pull) => pull.state === 'OPEN' && pull.review !== 'APPROVED')
            .map((pull) => ({ ...pull, group, instance })),
        )
        .map((pull) => [pull.url, pull]),
    ).values(),
  ];
  const chart = days.map((day) => {
    const summary = summarizeRuns(uniqueRuns, overviewDay(day), overviewDay(day));
    return { day, values: [summary.completed, summary.other, summary.failed] };
  });
  const attention =
    failed.length +
    pulls.length +
    offline.length +
    data.groups.filter((group) => !factoryMachine(group)).length;
  const refresh = () => {
    void data.settings.refetch();
    for (const result of [...data.workspaces, ...results]) {
      void result.refetch();
    }
  };
  return {
    sources,
    results,
    uniqueRuns,
    recent,
    totals,
    loaded,
    loading,
    refreshing,
    partial,
    offline,
    failed,
    pulls,
    chart,
    attention,
    refresh,
    hasUsage,
    tokens,
    sinceDay,
    untilDay,
  };
}

export type OverviewData = ReturnType<typeof useOverviewData>;
export type OpenOverviewFactory = (
  group: import('../computer-workspaces').FactoryGroup,
  view: import('@openfactory/core').WorkspaceView,
  instance?: import('../computer-workspaces').FactoryGroup['instances'][number],
  agent?: { id: string; title: string },
) => void;
