import { agentSchema } from '@openfactory/core';
import { z } from 'zod';
import { t3Rpc } from './t3-rpc';

export async function loadAgent(id: string) {
  const { tasks } = z
    .object({ tasks: z.array(agentSchema) })
    .parse(await t3Rpc('scheduledTasks.list', {}));
  const agent = tasks.find((task) => task.id === id);
  if (!agent) {
    throw new Error('This agent no longer exists. Refresh the agent list.');
  }
  return agent;
}
export async function loadAgentProjections(id: string) {
  const agent = await loadAgent(id);
  const shell = z
    .object({
      snapshot: z.object({
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
  const candidates = shell.snapshot.threads
    .filter(
      (thread) =>
        thread.projectId === agent.projectId &&
        (thread.id === agent.threadId || thread.title === agent.title),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const projections = await Promise.all(
    candidates.slice(0, 30).map(async (thread) => {
      const snapshot = z.object({ projection: z.unknown() }).parse(
        await t3Rpc('orchestration.subscribeThread', {
          threadId: thread.id,
          acceptBoundedSnapshot: false,
        }),
      );
      return snapshot.projection;
    }),
  );
  return { agent, projections, truncated: candidates.length > 30 };
}
