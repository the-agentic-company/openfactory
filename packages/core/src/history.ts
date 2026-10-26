import { z } from 'zod';

export const historyMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.string(),
});
export const agentRunSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  threadId: z.string(),
  source: z.enum(['t3', 'codex_archive', 'coordinator']),
  title: z.string(),
  status: z.string(),
  requestedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  messages: z.array(historyMessageSchema),
});
export type AgentRun = z.infer<typeof agentRunSchema>;
export type HistoryMessage = z.infer<typeof historyMessageSchema>;
export const threadHistorySchema = z.object({
  thread: z.object({ id: z.string(), title: z.string() }),
  runs: z.array(
    z.object({
      id: z.string(),
      ordinal: z.number(),
      userMessageId: z.string(),
      status: z.string(),
      requestedAt: z.string(),
      startedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
    }),
  ),
  messages: z.array(
    z.object({
      id: z.string(),
      runId: z.string().nullable(),
      scheduledTaskId: z.string().optional(),
      createdBy: z.string().optional(),
      creationSource: z.string().optional(),
      role: z.enum(['user', 'assistant', 'system']),
      text: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export function projectAgentRuns(
  input: unknown,
  agentId: string,
  coordinatorId: string | null,
): AgentRun[] {
  const projection = threadHistorySchema.parse(input);
  return projection.runs.flatMap((run) => {
    const trigger = projection.messages.find((message) => message.id === run.userMessageId);
    const owned = trigger?.scheduledTaskId === agentId;
    const shared = projection.thread.id === coordinatorId && trigger && !trigger.scheduledTaskId;
    if (!owned && !shared) {
      return [];
    }
    const messages = projection.messages
      .filter((message) => message.runId === run.id && message.role !== 'system')
      .map((message) => historyMessageSchema.parse(message));
    return [
      {
        id: run.id,
        agentId,
        threadId: projection.thread.id,
        source: owned ? 't3' : 'coordinator',
        title: owned ? `Run ${run.ordinal}` : `Coordinator turn ${run.ordinal}`,
        status: run.status,
        requestedAt: run.requestedAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        messages,
      },
    ];
  });
}
