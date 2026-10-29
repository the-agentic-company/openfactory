import { agentSchema, threadHistorySchema } from '@openfactory/core';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';

export async function loadFactoryRuns(project: string) {
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
    .parse(await runtimeRpc('workspace.snapshot', {}));
  const projectIds = new Set(
    shell.snapshot.projects
      .filter((p) => project === 'all' || p.workspaceRoot === project || p.id === project)
      .map((p) => p.id),
  );
  const threads = shell.snapshot.threads
    .filter((thread) => projectIds.has(thread.projectId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { tasks } = z
    .object({ tasks: z.array(agentSchema) })
    .parse(await runtimeRpc('agents.list', {}));
  const factoryAgents = new Map(
    tasks.filter((task) => projectIds.has(task.projectId)).map((task) => [task.id, task]),
  );
  const boundIds = new Set([...factoryAgents.values()].map((task) => task.threadId));
  const candidates = [
    ...threads.filter((thread) => boundIds.has(thread.id)),
    ...threads.filter((thread) => !boundIds.has(thread.id)),
  ].slice(0, 30);
  const results = [];
  const histories: unknown[] = [];
  let unavailable = 0;
  // Bound concurrency so browsing a busy factory keeps runtime reads bounded.
  for (let index = 0; index < candidates.length; index += 5) {
    const batch = await Promise.allSettled(
      candidates.slice(index, index + 5).map(async (thread) => {
        const { projection: raw } = z.object({ projection: z.unknown() }).parse(
          await runtimeRpc('sessions.read', {
            threadId: thread.id,
            acceptBoundedSnapshot: false,
          }),
        );
        const projection = threadHistorySchema.parse(raw);
        const runs = projection.runs.flatMap((run) => {
          const trigger = projection.messages.find((message) => message.id === run.userMessageId);
          const agent = trigger?.scheduledTaskId
            ? factoryAgents.get(trigger.scheduledTaskId)
            : undefined;
          if (!agent || agent.projectId !== thread.projectId) {
            return [];
          }
          const output = projection.messages
            .filter((message) => message.runId === run.id && message.role === 'assistant')
            .map((message) => message.text)
            .join('\n\n');
          return [
            {
              ...run,
              threadId: thread.id,
              projectId: thread.projectId,
              projectPath:
                shell.snapshot.projects.find((project) => project.id === thread.projectId)
                  ?.workspaceRoot ?? thread.projectId,
              title: thread.title,
              agentId: agent.id,
              createdBy: trigger?.createdBy ?? null,
              creationSource: trigger?.creationSource ?? null,
              output: output.slice(-50000),
              outputTruncated: output.length > 50000,
              request: trigger?.text.slice(0, 300) ?? '',
            },
          ];
        });
        return { runs, projection: raw };
      }),
    );
    for (const result of batch) {
      if (result.status === 'fulfilled') {
        results.push(...result.value.runs);
        if (result.value.runs.length) {
          histories.push(result.value.projection);
        }
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
    histories,
  };
}
