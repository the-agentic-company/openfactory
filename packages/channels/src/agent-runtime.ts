import { runtimeRpc, type RuntimeConnection } from '@openfactory/runtime/client';
import { z } from 'zod';

/** What a channel needs from OpenFactory: start a conversation, continue it, and read the reply. */
export interface AgentRuntime {
  start(input: { agentId: string; text: string; requestId: string }): Promise<RunReceipt>;
  send(input: { threadId: string; text: string; messageId: string }): Promise<RunReceipt>;
  /** Returns the run's status and its assistant messages so far. */
  read(input: { threadId: string; runId: string }): Promise<RunSnapshot>;
}

export type RunReceipt = { runId: string; threadId: string };
export type RunSnapshot = { status: string; error: string | null; replies: string[] };

const receiptSchema = z.object({ runId: z.string(), threadId: z.string() });
const projectionSchema = z.object({
  runs: z.array(
    z.object({ id: z.string(), status: z.string(), error: z.string().nullable().optional() }),
  ),
  messages: z.array(z.object({ runId: z.string().nullable(), role: z.string(), text: z.string() })),
});

/** Talks to the OpenFactory runtime over its local socket, or a paired remote host. */
export function openFactoryRuntime(connection?: RuntimeConnection): AgentRuntime {
  return {
    async start({ agentId, text, requestId }) {
      return receiptSchema.parse(
        await runtimeRpc('agents.run', { id: agentId, requestId, text }, connection),
      );
    },
    async send({ threadId, text, messageId }) {
      return receiptSchema.parse(
        await runtimeRpc('sessions.send', { threadId, text, messageId }, connection),
      );
    },
    async read({ threadId, runId }) {
      const projection = projectionSchema.parse(
        await runtimeRpc('sessions.projection', { threadId }, connection),
      );
      const run = projection.runs.find((item) => item.id === runId);
      return {
        status: run?.status ?? 'queued',
        error: run?.error ?? null,
        replies: projection.messages
          .filter((message) => message.runId === runId && message.role === 'assistant')
          .map((message) => message.text),
      };
    },
  };
}

const finished = new Set(['completed', 'failed', 'interrupted', 'cancelled']);

/** Polls a run until it finishes and returns its final assistant message. */
export async function waitForReply(
  runtime: AgentRuntime,
  receipt: RunReceipt,
  { intervalMs = 1500, timeoutMs = 30 * 60_000, signal }: WaitOptions = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    signal?.throwIfAborted();
    const snapshot = await runtime.read(receipt);
    if (finished.has(snapshot.status)) {
      const reply = snapshot.replies.at(-1)?.trim();
      if (snapshot.status === 'completed' && reply) {
        return reply;
      }
      throw new Error(snapshot.error ?? `The agent run ended as ${snapshot.status}.`);
    }
    if (Date.now() > deadline) {
      throw new Error('The agent is still working. Check OpenFactory for the result.');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export type WaitOptions = { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal };
