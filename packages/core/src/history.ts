import { z } from 'zod';

export const historyMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.string(),
});
export const capacityRetrySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending'), at: z.string() }),
  z.object({ status: z.literal('continued'), runId: z.string() }),
  z.object({ status: z.literal('cancelled') }),
]);
export const agentRunSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  threadId: z.string(),
  source: z.enum(['openfactory', 't3', 'codex_archive', 'coordinator']),
  title: z.string(),
  status: z.string(),
  requestedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  messages: z.array(historyMessageSchema),
  error: z.string().nullable().optional(),
  capacityRetry: capacityRetrySchema.nullable().optional(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;
export type HistoryMessage = z.infer<typeof historyMessageSchema>;
export const threadHistorySchema = z.object({
  thread: z.object({
    id: z.string(),
    title: z.string(),
    runtime: z.literal('openfactory').optional(),
  }),
  runs: z.array(
    z.object({
      id: z.string(),
      ordinal: z.number(),
      userMessageId: z.string(),
      status: z.string(),
      requestedAt: z.string(),
      startedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
      usage: z
        .object({
          input: z.number(),
          cached: z.number(),
          cacheWrite: z.number(),
          output: z.number(),
          costUsd: z.number().nullable(),
        })
        .nullable()
        .optional(),
      error: z.string().nullable().optional(),
      capacityRetry: capacityRetrySchema.nullable().optional(),
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
        source: owned
          ? projection.thread.runtime === 'openfactory'
            ? 'openfactory'
            : 't3'
          : 'coordinator',
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

export function projectAgentConversations(input: unknown, agentId: string): AgentRun[] {
  const projection = threadHistorySchema.parse(input);
  const conversations: AgentRun[] = [];
  const latestByAgent = new Map<string, AgentRun>();
  let current: AgentRun | undefined;
  for (const run of [...projection.runs].sort((a, b) => a.ordinal - b.ordinal)) {
    const trigger = projection.messages.find((message) => message.id === run.userMessageId);
    if (!trigger) {
      continue;
    }
    const isDispatch =
      trigger.id.startsWith('scheduled-task-message:') ||
      (projection.thread.runtime === 'openfactory' &&
        (!['web', 'retry'].includes(trigger.creationSource ?? '') || !latestByAgent.has(agentId)));
    if (isDispatch && trigger.scheduledTaskId) {
      current = {
        id: run.id,
        agentId: trigger.scheduledTaskId,
        threadId: projection.thread.id,
        source: projection.thread.runtime === 'openfactory' ? 'openfactory' : 't3',
        title: `Run · ${new Date(run.requestedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
        status: run.status,
        requestedAt: run.requestedAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        messages: [],
      };
      conversations.push(current);
      latestByAgent.set(current.agentId, current);
    } else if (trigger.scheduledTaskId) {
      current =
        conversations.find((conversation) =>
          trigger.id.startsWith(`openfactory-run-message:${encodeURIComponent(conversation.id)}:`),
        ) ?? latestByAgent.get(trigger.scheduledTaskId);
    }
    if (!current) {
      continue;
    }
    current.messages.push(
      ...projection.messages
        .filter(
          (message) =>
            (message.runId === run.id || message.id === run.userMessageId) &&
            message.role !== 'system',
        )
        .map((message) => historyMessageSchema.parse(message)),
    );
    current.error = run.error;
    current.capacityRetry = run.capacityRetry;
    current.status = run.status;
    current.completedAt = run.completedAt;
  }
  return conversations.filter((conversation) => conversation.agentId === agentId);
}

export function groupArchivedConversations(runs: AgentRun[]): AgentRun[] {
  const threads = new Map<string, AgentRun>();
  for (const run of [...runs].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))) {
    const existing = threads.get(run.threadId);
    if (existing) {
      const ids = new Set(existing.messages.map((message) => message.id));
      existing.messages.push(...run.messages.filter((message) => !ids.has(message.id)));
      existing.completedAt = run.completedAt;
      existing.status = run.status;
    } else {
      threads.set(run.threadId, {
        ...run,
        id: `codex-archive:${run.threadId}`,
        title: 'Imported conversation',
        messages: [...run.messages],
      });
    }
  }
  return [...threads.values()];
}
