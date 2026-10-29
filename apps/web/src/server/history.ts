import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  agentRunSchema,
  threadHistorySchema,
  projectAgentConversations,
  groupArchivedConversations,
} from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';

export const getAgentHistory = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { loadAgentProjections } = await import('./agent-projections.server');
    const { agent, projections, truncated } = await loadAgentProjections(data.id);
    const live = projections.flatMap((projection) =>
      projectAgentConversations(projection, agent.id),
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
    const runs = [...live, ...groupArchivedConversations(archive)].sort((a, b) =>
      b.requestedAt.localeCompare(a.requestedAt),
    );
    const coordinatorId =
      agent.threadId ?? runs.find((run) => run.source === 'openfactory')?.threadId ?? null;
    return { runs, coordinatorId, truncated };
  });

export const sendAgentMessage = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().min(1),
      text: z.string().trim().min(1).max(16000),
      requestId: z.uuid(),
      threadId: z.string().min(1),
      runId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { loadAgent } = await import('./agent-projections.server');
    const [agent, projection] = await Promise.all([
      loadAgent(data.id),
      runtimeRpc('sessions.projection', { threadId: data.threadId }),
    ]);
    if (!projectAgentConversations(projection, agent.id).some((run) => run.id === data.runId)) {
      throw new Error('This run does not belong to the selected agent.');
    }
    // The browser supplies an idempotency key; retrying the same send cannot create a second turn.
    await runtimeRpc('sessions.send', {
      threadId: data.threadId,
      agentId: agent.id,
      messageId: `openfactory-chat-message:${data.requestId}`,
      text: data.text,
    });
    return { accepted: true, threadId: data.threadId, requestId: data.requestId };
  });

export const stopAgentRun = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1), threadId: z.string().min(1), requestId: z.uuid() }))
  .handler(async ({ data }) => {
    const { loadAgent } = await import('./agent-projections.server');
    const agent = await loadAgent(data.id);
    const projection = threadHistorySchema.parse(
      await runtimeRpc('sessions.projection', { threadId: data.threadId }),
    );
    if (
      agent.threadId !== data.threadId &&
      !projection.messages.some((message) => message.scheduledTaskId === agent.id)
    ) {
      throw new Error('This conversation does not belong to the selected agent.');
    }
    return runtimeRpc('sessions.stop', { threadId: data.threadId, agentId: agent.id }).then(
      (value) => z.object({ stopped: z.boolean() }).parse(value),
    );
  });
