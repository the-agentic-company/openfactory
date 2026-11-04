import { expect, it } from 'vite-plus/test';
import { summarizeRuns, type OverviewRun } from './overview-model';

function run(status: string, requestedAt: string): OverviewRun {
  return {
    id: `${status}:${requestedAt}`,
    agentId: 'agent',
    threadId: 'thread',
    title: 'Review',
    status,
    requestedAt,
    startedAt: null,
    completedAt: null,
  };
}
it('counts active runs independently of the selected period and keeps other outcomes separate', () => {
  const runs = [
    run('running', '2026-10-01T12:00:00Z'),
    run('waiting', '2026-11-05T12:00:00Z'),
    run('completed', '2026-11-05T12:00:00Z'),
    run('succeeded', '2026-11-04T12:00:00Z'),
    run('failed', '2026-11-03T12:00:00Z'),
    run('cancelled', '2026-11-02T12:00:00Z'),
    run('failed', '2026-10-01T12:00:00Z'),
  ];
  expect(summarizeRuns(runs, '2026-11-01', '2026-11-06')).toEqual({
    running: 2,
    completed: 2,
    failed: 1,
    other: 2,
  });
});
it('reports empty history as zero activity', () => {
  expect(summarizeRuns([], '2026-11-01', '2026-11-06')).toEqual({
    running: 0,
    completed: 0,
    failed: 0,
    other: 0,
  });
});
