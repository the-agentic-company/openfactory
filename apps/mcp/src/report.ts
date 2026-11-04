import { z } from 'zod';
import { readReportingHistory } from '@openfactory/runtime/reporting';

export const reportInputSchema = z.object({
  period: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('this_week') }),
      z.object({ type: z.literal('last_week') }),
      z.object({ type: z.literal('custom'), sinceDay: z.iso.date(), untilDay: z.iso.date() }),
    ])
    .default({ type: 'this_week' }),
  timeZone: z
    .string()
    .default('Europe/Paris')
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Use an IANA time zone, for example Europe/Paris.'),
  machine: z
    .string()
    .optional()
    .describe(
      'Runner ID or exact name from list_machines. Omit to include all paired runners and this computer.',
    ),
  project: z.string().optional().describe('Factory ID or workspace path. Omit for all factories.'),
  agentId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});

function localDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function reportRuns(
  history: ReturnType<typeof readReportingHistory>,
  raw: unknown,
  now = new Date(),
) {
  const input = reportInputSchema.parse(raw);
  const today = localDay(now, input.timeZone);
  const monday = shiftDay(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const sinceDay =
    input.period.type === 'custom'
      ? input.period.sinceDay
      : input.period.type === 'last_week'
        ? shiftDay(monday, -7)
        : monday;
  const untilDay =
    input.period.type === 'custom'
      ? input.period.untilDay
      : input.period.type === 'last_week'
        ? monday
        : shiftDay(monday, 7);
  if (untilDay <= sinceDay) {
    throw new Error('untilDay must be after sinceDay. The end date is exclusive.');
  }
  const projectIds = new Set(
    history.projects
      .filter(
        (project) =>
          !input.project || project.id === input.project || project.workspaceRoot === input.project,
      )
      .map((project) => project.id),
  );
  if (input.project && !projectIds.size) {
    throw new Error(`Unknown factory: ${input.project}. Call list_factories first.`);
  }
  if (input.agentId && !history.agents.some((agent) => agent.id === input.agentId)) {
    throw new Error(`Unknown agent: ${input.agentId}. Call list_agents first.`);
  }
  const runs = history.runs
    .filter((run) => {
      const day = localDay(new Date(run.requestedAt), input.timeZone);
      return (
        (!input.project || (run.projectId !== null && projectIds.has(run.projectId))) &&
        (!input.agentId || run.agentId === input.agentId) &&
        day >= sinceDay &&
        day < untilDay &&
        new Date(run.requestedAt) <= now
      );
    })
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || a.id.localeCompare(b.id));
  const byStatus: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const byFactory = history.projects
    .filter((project) => projectIds.has(project.id))
    .map((project) => ({
      projectId: project.id,
      title: project.title,
      total: runs.filter((run) => run.projectId === project.id).length,
    }));
  for (const run of runs) {
    byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
    const day = localDay(new Date(run.requestedAt), input.timeZone);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }
  return {
    readAt: now.toISOString(),
    scope: 'This machine’s retained OpenFactory runs and imported agent history.',
    counting:
      'One execution turn per run ID, counted by requestedAt. Includes queued, failed and interrupted turns. Follow-up turns count separately. Native records take precedence over imported duplicates.',
    sinceDay,
    untilDay,
    endExclusive: true,
    timeZone: input.timeZone,
    total: runs.length,
    byStatus,
    byDay,
    byFactory,
    unassigned: runs.filter((run) => run.projectId === null).length,
    runs: runs.slice(input.offset, input.offset + input.limit),
    nextOffset: input.offset + input.limit < runs.length ? input.offset + input.limit : null,
  };
}
