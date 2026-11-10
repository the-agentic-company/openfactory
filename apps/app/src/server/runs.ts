import { loadUsageRates, priceRunUsage } from '@openfactory/runtime/run-usage';
import { notFound } from '@tanstack/react-router';
import { projectWorkspace } from '../project-path';
import { routeReference } from '../run-path';
import {
  projectAgentConversations,
  projectRunDetail,
  runDetailProjectionSchema as projectionSchema,
} from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';
import { readScorers } from './factory-store';
async function loadRun(threadId: string, runId: string, byReference = false) {
  const { projection } = z.object({ projection: projectionSchema }).parse(
    await runtimeRpc('sessions.read', {
      threadId,
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
  const { projection, run } = await loadRun(data.threadId, data.runId, byReference);
  const shell = z
    .object({
      snapshot: z.object({
        projects: z.array(
          z.object({ id: z.string(), title: z.string(), workspaceRoot: z.string() }),
        ),
      }),
    })
    .parse(await runtimeRpc('workspace.snapshot', {}));
  const rates = await loadUsageRates();
  const priced = {
    ...projection,
    runs: projection.runs.map((item) => ({
      ...item,
      usage:
        item.usage && item.modelSelection
          ? priceRunUsage(
              item.usage,
              item.modelSelection.model,
              rates,
              typeof item.modelSelection.options?.serviceTier === 'string'
                ? item.modelSelection.options.serviceTier
                : 'default',
            )
          : item.usage,
    })),
  };
  return projectRunDetail(priced, run.id, shell.snapshot.projects, await readScorers());
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
