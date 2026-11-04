import { agentRunSchema } from '@openfactory/core';
import { runtimeInputs, runtimeResults } from '@openfactory/protocol';
import { z } from 'zod';
import { readFactoryRuns, type RuntimeCall } from './history';

export const factoryOverviewInputSchema = runtimeInputs['usage.factory'].extend({
  days: z.union([z.literal(7), z.literal(30)]),
});
export const factoryOverviewSchema = z.object({
  runs: z.array(agentRunSchema.omit({ messages: true, source: true })),
  usage: runtimeResults['usage.factory'].nullable(),
  pulls: runtimeResults['pullRequests.list'].nullable(),
  issues: z.array(z.string()),
  limited: z.boolean(),
  historyLoaded: z.boolean(),
  savedAt: z.string(),
  sinceDay: z.string(),
  untilDay: z.string(),
});

export async function readFactoryOverview(
  input: z.infer<typeof factoryOverviewInputSchema>,
  call: RuntimeCall,
) {
  const [history, usage, pulls] = await Promise.allSettled([
    readFactoryRuns(input.project, call),
    call('usage.factory', runtimeInputs['usage.factory'].parse(input)).then((value) =>
      runtimeResults['usage.factory'].parse(value),
    ),
    call('pullRequests.list', { project: input.project, days: input.days, scope: 'open' }).then(
      (value) => runtimeResults['pullRequests.list'].parse(value),
    ),
  ]);
  if (history.status === 'rejected' && usage.status === 'rejected' && pulls.status === 'rejected') {
    throw history.reason;
  }
  const issues: string[] = [];
  if (history.status === 'rejected') {
    issues.push('Run history unavailable.');
  } else if (history.value.unavailable) {
    issues.push(`${history.value.unavailable} run histories unavailable.`);
  }
  if (usage.status === 'rejected') {
    issues.push('Token usage unavailable.');
  }
  if (pulls.status === 'rejected') {
    issues.push('Pull requests unavailable.');
  }
  return factoryOverviewSchema.parse({
    runs: history.status === 'fulfilled' ? history.value.runs : [],
    usage: usage.status === 'fulfilled' ? usage.value : null,
    pulls: pulls.status === 'fulfilled' ? pulls.value : null,
    issues,
    limited: history.status === 'fulfilled' && history.value.limited,
    historyLoaded:
      history.status === 'fulfilled' &&
      (history.value.sampledThreads === 0 ||
        history.value.unavailable < history.value.sampledThreads),
    savedAt: new Date().toISOString(),
    sinceDay: input.sinceDay,
    untilDay: input.untilDay,
  });
}
