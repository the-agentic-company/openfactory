import { agentSchema, runLinks, scoreOutput, threadHistorySchema } from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { t3Rpc } from './t3-rpc';
import { readScorers } from './factory-store';
const attachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});
const projectionSchema = threadHistorySchema.extend({
  thread: threadHistorySchema.shape.thread.extend({ projectId: z.string() }),
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
async function loadRun(threadId: string, runId: string) {
  const projection = projectionSchema.parse(
    await t3Rpc('orchestration.getThreadProjection', { threadId }),
  );
  const run = projection.runs.find((item) => item.id === runId);
  if (!run) {
    throw new Error('This run is no longer available in the conversation history.');
  }
  const trigger = projection.messages.find((message) => message.id === run.userMessageId);
  return { projection, run, trigger };
}
export const getRunDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ threadId: z.string().min(1), runId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { projection, run, trigger } = await loadRun(data.threadId, data.runId);
    const shell = z
      .object({
        snapshot: z.object({
          projects: z.array(
            z.object({ id: z.string(), title: z.string(), workspaceRoot: z.string() }),
          ),
        }),
      })
      .parse(await t3Rpc('orchestration.subscribeShell', {}));
    const project = shell.snapshot.projects.find((item) => item.id === projection.thread.projectId);
    const messages = projection.messages.filter(
      (message) =>
        (message.runId === run.id || message.id === run.userMessageId) && message.role !== 'system',
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
    return {
      run,
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
    const { trigger } = await loadRun(data.threadId, data.runId);
    const messageId = `openfactory-run-message:${data.requestId}`;
    await t3Rpc('orchestration.dispatchCommand', {
      type: 'message.dispatch',
      commandId: `openfactory-run-followup:${data.requestId}`,
      threadId: data.threadId,
      messageId,
      createdBy: 'user',
      creationSource: 'web',
      text: data.text,
      attachments: [],
      dispatchMode: { type: 'queue_after_active' },
      ...(trigger?.scheduledTaskId ? { scheduledTaskId: trigger.scheduledTaskId } : {}),
    });
    const projection = threadHistorySchema.parse(
      await t3Rpc('orchestration.getThreadProjection', { threadId: data.threadId }),
    );
    return { runId: projection.runs.find((run) => run.userMessageId === messageId)?.id ?? null };
  });

export const getRunImage = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      threadId: z.string().min(1),
      runId: z.string().min(1),
      attachmentId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { projection, run } = await loadRun(data.threadId, data.runId);
    const image = projection.messages
      .filter((message) => message.runId === run.id || message.id === run.userMessageId)
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
    const result = z.object({ relativeUrl: z.string() }).parse(
      await t3Rpc('assets.createUrl', {
        resource: {
          _tag: 'attachment',
          attachmentId: image.id,
          mimeType: image.mimeType,
          disposition: 'inline',
        },
      }),
    );
    const origin = new URL(process.env.T3_ORIGIN ?? 'http://127.0.0.1:3773');
    const url = new URL(result.relativeUrl, origin);
    if (url.origin !== origin.origin) {
      throw new Error('Invalid attachment source.');
    }
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const mime = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!response.ok || !allowed.includes(mime)) {
      throw new Error('This attachment could not be previewed.');
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 5 * 1024 * 1024) {
      throw new Error('This image is too large to preview.');
    }
    return { dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}` };
  });
