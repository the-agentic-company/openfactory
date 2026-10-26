import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  agentRunSchema,
  historyMessageSchema,
  threadHistorySchema,
  projectAgentRuns,
} from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { t3Rpc } from './t3-rpc';

export const getAgentHistory = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { loadAgentProjections } = await import('./agent-projections.server');
    const { agent, projections, truncated } = await loadAgentProjections(data.id);
    const live = projections.flatMap((projection) =>
      projectAgentRuns(projection, agent.id, agent.threadId),
    );
    const path = join(
      process.env.OPENFACTORY_HISTORY_DIR ?? join(homedir(), '.config/openfactory/history'),
      `${createHash('sha256').update(agent.id).digest('hex')}.json`,
    );
    const raw = await readFile(path, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    });
    const archive = raw
      ? z
          .array(agentRunSchema)
          .parse(JSON.parse(raw))
          .filter((run) => run.agentId === agent.id)
      : [];
    const runs = [...live, ...archive].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const coordinatorId =
      agent.threadId ?? runs.find((run) => run.source === 't3')?.threadId ?? null;
    const coordinator = projections
      .map((projection) => threadHistorySchema.parse(projection))
      .find((projection) => projection.thread.id === coordinatorId);
    const allMessages =
      coordinator?.messages
        .filter((message) => message.role !== 'system')
        .map((message) => historyMessageSchema.parse(message)) ?? [];
    return {
      runs,
      coordinatorId,
      messages: allMessages.slice(-100),
      running:
        coordinator?.runs.some((run) =>
          ['preparing', 'queued', 'starting', 'running', 'waiting'].includes(run.status),
        ) ?? false,
      truncated: truncated || allMessages.length > 100,
    };
  });

export const sendAgentMessage = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().min(1),
      text: z.string().trim().min(1).max(16000),
      requestId: z.uuid(),
      threadId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { loadAgent } = await import('./agent-projections.server');
    const agent = await loadAgent(data.id);
    if (data.threadId !== agent.threadId) {
      const projection = threadHistorySchema.parse(
        await t3Rpc('orchestration.getThreadProjection', { threadId: data.threadId }),
      );
      if (!projection.messages.some((message) => message.scheduledTaskId === agent.id)) {
        throw new Error('This conversation does not belong to the selected agent.');
      }
    }
    // The browser supplies an idempotency key; retrying the same send cannot create a second turn.
    await t3Rpc('orchestration.dispatchCommand', {
      type: 'message.dispatch',
      commandId: `openfactory-chat:${data.requestId}`,
      threadId: data.threadId,
      messageId: `openfactory-chat-message:${data.requestId}`,
      scheduledTaskId: agent.id,
      createdBy: 'user',
      creationSource: 'web',
      text: data.text,
      attachments: [],
      dispatchMode: { type: 'queue_after_active' },
    });
    return { accepted: true, threadId: data.threadId, requestId: data.requestId };
  });

export const stopAgentRun = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1), threadId: z.string().min(1), requestId: z.uuid() }))
  .handler(async ({ data }) => {
    const { loadAgent } = await import('./agent-projections.server');
    const agent = await loadAgent(data.id);
    const projection = threadHistorySchema.parse(
      await t3Rpc('orchestration.getThreadProjection', { threadId: data.threadId }),
    );
    if (
      agent.threadId !== data.threadId &&
      !projection.messages.some((message) => message.scheduledTaskId === agent.id)
    ) {
      throw new Error('This conversation does not belong to the selected agent.');
    }
    const active = [...projection.runs]
      .reverse()
      .find((run) => ['preparing', 'starting', 'running', 'waiting'].includes(run.status));
    if (active) {
      await t3Rpc('orchestration.dispatchCommand', {
        type: 'run.interrupt',
        commandId: `openfactory-stop:${data.requestId}`,
        threadId: data.threadId,
        runId: active.id,
        reason: 'Stopped from OpenFactory assistant',
        holdQueue: false,
      });
    }
    return { stopped: Boolean(active) };
  });
