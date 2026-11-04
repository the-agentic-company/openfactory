import { z } from 'zod';
import { agentSchema } from './agents';
import { projectAgentConversations, threadHistorySchema } from './history';
import { runLinks } from './run-view';
import { scoreOutput, type Scorer } from './factory';

const attachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});
export const runDetailProjectionSchema = threadHistorySchema.extend({
  thread: threadHistorySchema.shape.thread.extend({
    projectId: z.string(),
    nativeSessionId: z.string().nullable().optional(),
    provider: z.string().optional(),
    cwd: z.string().optional(),
  }),
  runs: z.array(
    threadHistorySchema.shape.runs.element.extend({
      modelSelection: agentSchema.shape.modelSelection.nullish(),
    }),
  ),
  messages: z.array(
    threadHistorySchema.shape.messages.element.extend({
      attachments: z.array(attachmentSchema).default([]),
    }),
  ),
});

export function projectRunDetail(
  raw: unknown,
  runId: string,
  projects: { id: string; title: string; workspaceRoot: string }[],
  scorers: Scorer[],
) {
  const projection = runDetailProjectionSchema.parse(raw);
  const run = projection.runs.find((item) => item.id === runId);
  if (!run) {
    throw new Error('This run is no longer available in the conversation history.');
  }
  const trigger = projection.messages.find((message) => message.id === run.userMessageId);
  const conversation = trigger?.scheduledTaskId
    ? projectAgentConversations(projection, trigger.scheduledTaskId).find(
        (item) =>
          item.id === run.id || item.messages.some((message) => message.id === run.userMessageId),
      )
    : undefined;
  const project = projects.find((item) => item.id === projection.thread.projectId);
  const messageIds = conversation && new Set(conversation.messages.map((message) => message.id));
  const messages = projection.messages.filter(
    (message) =>
      message.role !== 'system' &&
      (messageIds
        ? messageIds.has(message.id)
        : message.runId === run.id || message.id === run.userMessageId),
  );
  const output = messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.text)
    .join('\n\n');
  const rules = scorers.filter(
    (scorer) =>
      (scorer.project === 'all' ||
        scorer.project === project?.workspaceRoot ||
        scorer.project === projection.thread.projectId) &&
      (!scorer.agentId || scorer.agentId === trigger?.scheduledTaskId),
  );
  const rootRun = projection.runs.find((item) => item.id === conversation?.id) ?? run;
  return {
    run: conversation
      ? {
          ...rootRun,
          status: conversation.status,
          completedAt: conversation.completedAt,
          error: conversation.error,
          capacityRetry: conversation.capacityRetry,
        }
      : run,
    thread: projection.thread,
    project,
    agentId: trigger?.scheduledTaskId ?? null,
    createdBy: trigger?.createdBy ?? null,
    creationSource: trigger?.creationSource ?? null,
    messages: messages.slice(-100).map((message) => ({
      id: message.id,
      role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
      text: message.text.slice(-50000),
      createdAt: message.createdAt,
      attachments: message.attachments,
    })),
    limited: messages.length > 100 || messages.some((message) => message.text.length > 50000),
    links: runLinks(messages.map((message) => message.text).join('\n')).slice(0, 100),
    attachments: [
      ...new Map(
        messages.flatMap((message) => message.attachments).map((item) => [item.id, item]),
      ).values(),
    ],
    scores: rules.map((scorer) => ({
      id: scorer.id,
      name: scorer.name,
      rule: scorer.rule,
      result:
        ['completed', 'succeeded'].includes(run.status) && output
          ? scoreOutput(scorer.rule, output)
          : null,
    })),
  };
}
