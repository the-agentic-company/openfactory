import { notFound } from '@tanstack/react-router';
import { projectWorkspace } from '../project-path';
import { routeReference } from '../run-path';
import {
  agentSchema,
  projectAgentConversations,
  runLinks,
  scoreOutput,
  threadHistorySchema,
} from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';
import { readScorers } from './factory-store';
const attachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});
const projectionSchema = threadHistorySchema.extend({
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
async function loadRun(threadId: string, runId: string, byReference = false) {
  const { projection } = z.object({ projection: projectionSchema }).parse(
    await runtimeRpc('sessions.read', {
      threadId,
      acceptBoundedSnapshot: false,
    }),
  );
  const matches = projection.runs.filter((item) =>
    byReference ? routeReference(item.id) === runId : item.id === runId,
  );
  const run = matches.length === 1 ? matches[0] : undefined;
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
  return { projection, run, trigger, conversation };
}
async function runDetail(data: { threadId: string; runId: string }, byReference = false) {
  const { projection, run, trigger, conversation } = await loadRun(
    data.threadId,
    data.runId,
    byReference,
  );
  const shell = z
    .object({
      snapshot: z.object({
        projects: z.array(
          z.object({ id: z.string(), title: z.string(), workspaceRoot: z.string() }),
        ),
      }),
    })
    .parse(await runtimeRpc('workspace.snapshot', {}));
  const project = shell.snapshot.projects.find((item) => item.id === projection.thread.projectId);
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
  const rules = (await readScorers()).filter(
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

export const getRunDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ threadId: z.string().min(1), runId: z.string().min(1) }))
  .handler(({ data }) => runDetail(data));

export const getRunByPath = createServerFn({ method: 'GET' })
  .validator(
    z.object({ project: z.string().min(1), thread: z.string().min(1), runId: z.string().min(1) }),
  )
  .handler(async ({ data }) => {
    const { snapshot } = z
      .object({
        snapshot: z.object({
          projects: z.array(z.object({ id: z.string(), workspaceRoot: z.string() })),
          threads: z.array(z.object({ id: z.string(), projectId: z.string() })),
        }),
      })
      .parse(await runtimeRpc('workspace.snapshot', {}));
    const root = projectWorkspace(data.project, snapshot.projects);
    const project = snapshot.projects.find((item) => item.workspaceRoot === root);
    const matches = snapshot.threads.filter(
      (item) => item.projectId === project?.id && routeReference(item.id) === data.thread,
    );
    const thread = matches.length === 1 ? matches[0] : undefined;
    if (!thread) {
      throw notFound();
    }
    const detail = await runDetail({ threadId: thread.id, runId: data.runId }, true);
    if (detail.thread.projectId !== project?.id) {
      throw notFound();
    }
    return detail;
  });

export const sendRunFollowup = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      threadId: z.string().min(1),
      runId: z.string().min(1),
      requestId: z.uuid(),
      text: z.string().trim().min(1).max(16000),
    }),
  )
  .handler(async ({ data }) => {
    const { trigger, conversation } = await loadRun(data.threadId, data.runId);
    const messageId = `openfactory-run-message:${encodeURIComponent(data.runId)}:${data.requestId}`;
    const receipt = z.object({ runId: z.string() }).parse(
      await runtimeRpc('sessions.send', {
        threadId: data.threadId,
        messageId,
        text: data.text,
        ...(trigger?.scheduledTaskId ? { agentId: trigger.scheduledTaskId } : {}),
      }),
    );
    if (conversation) {
      return { runId: conversation.id };
    }
    return { runId: receipt.runId };
  });

export const getRunImage = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      threadId: z.string().min(1),
      runId: z.string().min(1),
      attachmentId: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<{ dataUrl: string }> => {
    const { projection, run, conversation } = await loadRun(data.threadId, data.runId);
    const messageIds = conversation && new Set(conversation.messages.map((message) => message.id));
    const image = projection.messages
      .filter((message) =>
        messageIds
          ? messageIds.has(message.id)
          : message.runId === run.id || message.id === run.userMessageId,
      )
      .flatMap((message) => message.attachments)
      .find((item) => item.id === data.attachmentId);
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (
      !image ||
      image.type !== 'image' ||
      !allowed.includes(image.mimeType) ||
      image.sizeBytes > 5 * 1024 * 1024
    ) {
      throw new Error('No preview is available for this attachment.');
    }
    throw new Error(
      'This archived attachment was stored in T3. Its text transcript remains available.',
    );
  });
