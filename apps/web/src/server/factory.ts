import { randomUUID } from 'node:crypto';
import {
  agentAppearanceSchema,
  agentSchema,
  scorerSchema,
  threadHistorySchema,
} from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { t3Rpc } from './t3-rpc';
import {
  readScorers,
  removeScorer,
  writeAppearance,
  writeScorer,
  writeFactoryProfile,
} from './factory-store';
import { factoryProfileSchema } from '../factory-profile';

export const updateFactoryProfile = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1), profile: factoryProfileSchema }))
  .handler(async ({ data }) => {
    const shell = z
      .object({ snapshot: z.object({ projects: z.array(z.object({ id: z.string() })) }) })
      .parse(await t3Rpc('orchestration.subscribeShell', {}));
    if (!shell.snapshot.projects.some((project) => project.id === data.id)) {
      throw new Error('This factory no longer exists. Refresh and try again.');
    }
    await writeFactoryProfile(data.id, data.profile);
    return data.profile;
  });

export const setAgentAppearance = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1), appearance: agentAppearanceSchema }))
  .handler(async ({ data }) => {
    const { tasks } = z
      .object({ tasks: z.array(agentSchema) })
      .parse(await t3Rpc('scheduledTasks.list', {}));
    if (!tasks.some((task) => task.id === data.id)) {
      throw new Error('This agent no longer exists.');
    }
    await writeAppearance(data.id, data.appearance);
    return data.appearance;
  });
export const getScorers = createServerFn({ method: 'GET' }).handler(() => readScorers());
export const createScorer = createServerFn({ method: 'POST' })
  .validator(scorerSchema.omit({ id: true, createdAt: true }))
  .handler(async ({ data }) => {
    const scorer = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
    await writeScorer(scorer);
    return scorer;
  });
export const deleteScorer = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await removeScorer(data.id);
    return { deleted: true };
  });
export const getFactoryRuns = createServerFn({ method: 'GET' })
  .validator(z.object({ project: z.string() }))
  .handler(async ({ data }) => {
    const shell = z
      .object({
        snapshot: z.object({
          projects: z.array(z.object({ id: z.string(), workspaceRoot: z.string() })),
          threads: z.array(
            z.object({
              id: z.string(),
              projectId: z.string(),
              title: z.string(),
              createdAt: z.string(),
            }),
          ),
        }),
      })
      .parse(await t3Rpc('orchestration.subscribeShell', {}));
    const projectIds = new Set(
      shell.snapshot.projects
        .filter(
          (p) =>
            data.project === 'all' || p.workspaceRoot === data.project || p.id === data.project,
        )
        .map((p) => p.id),
    );
    const threads = shell.snapshot.threads
      .filter((thread) => projectIds.has(thread.projectId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const { tasks } = z
      .object({ tasks: z.array(agentSchema) })
      .parse(await t3Rpc('scheduledTasks.list', {}));
    const boundIds = new Set(tasks.map((task) => task.threadId).filter(Boolean));
    const candidates = [
      ...threads.filter((thread) => boundIds.has(thread.id)),
      ...threads.filter((thread) => !boundIds.has(thread.id)),
    ].slice(0, 30);
    const results = [];
    let unavailable = 0;
    // Bound concurrency so browsing a busy factory does not flood T3's RPC server.
    for (let index = 0; index < candidates.length; index += 5) {
      const batch = await Promise.allSettled(
        candidates.slice(index, index + 5).map(async (thread) => {
          const projection = threadHistorySchema.parse(
            await t3Rpc('orchestration.getThreadProjection', { threadId: thread.id }),
          );
          return projection.runs.map((run) => {
            const trigger = projection.messages.find((message) => message.id === run.userMessageId);
            const output = projection.messages
              .filter((message) => message.runId === run.id && message.role === 'assistant')
              .map((message) => message.text)
              .join('\n\n');
            return {
              ...run,
              threadId: thread.id,
              projectId: thread.projectId,
              projectPath:
                shell.snapshot.projects.find((project) => project.id === thread.projectId)
                  ?.workspaceRoot ?? thread.projectId,
              title: thread.title,
              agentId: trigger?.scheduledTaskId ?? null,
              createdBy: trigger?.createdBy ?? null,
              creationSource: trigger?.creationSource ?? null,
              output: output.slice(-50000),
              outputTruncated: output.length > 50000,
              request: trigger?.text.slice(0, 300) ?? '',
            };
          });
        }),
      );
      for (const result of batch) {
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        } else {
          unavailable++;
        }
      }
    }
    return {
      runs: results.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).slice(0, 300),
      limited: threads.length > 30 || results.length > 300,
      unavailable,
      sampledThreads: candidates.length,
    };
  });
