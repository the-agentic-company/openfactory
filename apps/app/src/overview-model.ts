import type { factoryOverviewSchema } from '@openfactory/client';
import type { z } from 'zod';

export type OverviewRun = z.infer<typeof factoryOverviewSchema>['runs'][number];
const completed = new Set(['completed', 'succeeded']);
const active = new Set(['preparing', 'queued', 'starting', 'running', 'waiting']);
export const overviewDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function summarizeRuns(runs: OverviewRun[], sinceDay: string, untilDay: string) {
  const recent = runs.filter((run) => {
    const day = overviewDay(new Date(run.requestedAt));
    return day >= sinceDay && day <= untilDay;
  });
  return {
    running: runs.filter((run) => active.has(run.status)).length,
    completed: recent.filter((run) => completed.has(run.status)).length,
    failed: recent.filter((run) => run.status === 'failed').length,
    other: recent.filter((run) => !completed.has(run.status) && run.status !== 'failed').length,
  };
}

const numberFormat = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export const overviewNumber = (value: number) => numberFormat.format(value);
export const overviewTimestamp = (value: string) => timeFormat.format(new Date(value));
