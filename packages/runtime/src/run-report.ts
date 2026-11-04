import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { agentSchema, threadHistorySchema } from '@openfactory/core';
import { z } from 'zod';
import { projectSchema } from './contracts';

const storedRow = z.object({ data: z.string() });
export const reportRunSchema = threadHistorySchema.shape.runs.element
  .pick({
    id: true,
    status: true,
    requestedAt: true,
    startedAt: true,
    completedAt: true,
  })
  .extend({ agentId: z.string(), threadId: z.string() });
const archiveSchema = threadHistorySchema.extend({
  thread: threadHistorySchema.shape.thread.extend({ projectId: z.string() }),
});

export function readReportingHistory(directory: string) {
  const db = new DatabaseSync(join(directory, 'runtime.sqlite'), { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000; BEGIN');
    const read = <S extends z.ZodType>(
      table: 'projects' | 'agents' | 'runs' | 'archives',
      schema: S,
    ) =>
      db
        .prepare(`SELECT data FROM ${table}`)
        .all()
        .map((row) => schema.parse(JSON.parse(storedRow.parse(row).data)));
    const projects = read('projects', projectSchema);
    const agents = read('agents', agentSchema);
    const runs = new Map(
      read('runs', reportRunSchema).map((run) => [
        run.id,
        {
          ...run,
          projectId: agents.find((agent) => agent.id === run.agentId)?.projectId ?? null,
          source: 'openfactory',
        },
      ]),
    );
    for (const archive of read('archives', archiveSchema)) {
      for (const run of archive.runs) {
        const trigger = archive.messages.find((message) => message.id === run.userMessageId);
        if (!trigger?.scheduledTaskId || runs.has(run.id)) {
          continue;
        }
        runs.set(run.id, {
          ...reportRunSchema.parse({
            ...run,
            threadId: archive.thread.id,
            agentId: trigger.scheduledTaskId,
          }),
          projectId: archive.thread.projectId,
          source: 'imported',
        });
      }
    }
    return { projects, agents, runs: [...runs.values()] };
  } finally {
    db.close();
  }
}

export const reportingHistorySchema = z.object({
  projects: z.array(projectSchema),
  agents: z.array(agentSchema),
  runs: z.array(reportRunSchema.extend({ projectId: z.string().nullable(), source: z.string() })),
});
