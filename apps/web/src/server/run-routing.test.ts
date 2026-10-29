import { expect, it, vi } from 'vite-plus/test';
import { getRunByPath, sendRunFollowup } from './runs';
import { runtimeRpc } from './runtime-rpc';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ validator: () => ({ handler: (handler: unknown) => handler }) }),
}));
vi.mock('./runtime-rpc', () => ({ runtimeRpc: vi.fn() }));
vi.mock('./factory-store', () => ({ readScorers: async () => [] }));

const threadId = 'thread:project:project-1:7f8b1966-378b-4551-a832-a34fe2a60751';
const migratedRun = `run:thread:${encodeURIComponent(threadId)}:ordinal:38`;

function setup(
  id = threadId,
  runId = migratedRun,
  duplicate = false,
  runState: { status: string; error?: string } = { status: 'completed' },
) {
  vi.mocked(runtimeRpc).mockImplementation(async (method, payload) => {
    if (method === 'workspace.snapshot') {
      return {
        snapshot: {
          projects: [{ id: 'project-1', title: 'Mibba', workspaceRoot: '/work/mibba' }],
          threads: [
            { id, projectId: 'project-1' },
            ...(duplicate
              ? [{ id: '7f8b1966-378b-4551-a832-a34fe2a60751', projectId: 'project-1' }]
              : []),
          ],
        },
      };
    }
    expect(method).toBe('sessions.read');
    expect(payload).toMatchObject({ threadId: id });
    return {
      projection: {
        thread: { id, title: 'Conversation', projectId: 'project-1' },
        runs: [
          {
            id: runId,
            ordinal: 38,
            userMessageId: 'message-1',
            ...runState,
            requestedAt: '2026-10-29T09:00:00Z',
            startedAt: null,
            completedAt: null,
          },
        ],
        messages: [
          {
            id: 'message-1',
            runId,
            role: 'user',
            text: 'Run the audit',
            createdAt: '2026-10-29T09:00:00Z',
          },
        ],
      },
    };
  });
}

it('resolves readable migrated references to the exact stored conversation and run', async () => {
  setup();
  const detail = await getRunByPath({
    data: { project: 'mibba', thread: '7f8b1966-378b-4551-a832-a34fe2a60751', runId: '38' },
  });
  expect(detail.thread.id).toBe(threadId);
  expect(detail.run.id).toBe(migratedRun);
  expect(detail.messages[0]?.text).toBe('Run the audit');
});

it('loads native UUID references unchanged', async () => {
  setup('native-thread', 'native-run');
  const detail = await getRunByPath({
    data: { project: 'mibba', thread: 'native-thread', runId: 'native-run' },
  });
  expect(detail.run.id).toBe('native-run');
});

it('rejects unknown projects, conversations, runs, and ambiguous references', async () => {
  setup();
  for (const data of [
    { project: 'other', thread: '7f8b1966-378b-4551-a832-a34fe2a60751', runId: '38' },
    { project: 'mibba', thread: 'missing', runId: '38' },
    { project: 'mibba', thread: '7f8b1966-378b-4551-a832-a34fe2a60751', runId: '39' },
  ]) {
    await expect(getRunByPath({ data })).rejects.toBeDefined();
  }
  setup(threadId, migratedRun, true);
  await expect(
    getRunByPath({
      data: { project: 'mibba', thread: '7f8b1966-378b-4551-a832-a34fe2a60751', runId: '38' },
    }),
  ).rejects.toBeDefined();
});

it('returns the stored provider failure for display on the run page', async () => {
  const error = 'Selected model is at capacity. Please try a different model.';
  setup('native-thread', 'native-run', false, { status: 'failed', error });
  const detail = await getRunByPath({
    data: { project: 'mibba', thread: 'native-thread', runId: 'native-run' },
  });
  expect(detail.run).toMatchObject({ status: 'failed', error });
});

function setupConversation() {
  const projection = {
    thread: {
      id: 'native-thread',
      title: 'Conversation',
      projectId: 'project-1',
      runtime: 'openfactory',
    },
    runs: ['first', 'reply'].map((id, index) => ({
      id,
      ordinal: index + 1,
      userMessageId: `user-${id}`,
      status: 'completed',
      requestedAt: '2026-10-29T09:00:00Z',
      startedAt: null,
      completedAt: null,
    })),
    messages: ['first', 'reply'].flatMap((id, index) => [
      {
        id: `user-${id}`,
        runId: id,
        scheduledTaskId: 'operator',
        creationSource: index ? 'web' : 'schedule',
        role: 'user',
        text: index ? 'My question' : 'Run the audit',
        createdAt: '2026-10-29T09:00:00Z',
      },
      {
        id: `answer-${id}`,
        runId: id,
        role: 'assistant',
        text: `Answer ${id}`,
        createdAt: '2026-10-29T09:00:00Z',
      },
    ]),
  };
  vi.mocked(runtimeRpc).mockImplementation(async (method) => {
    if (method === 'sessions.read') {
      return { projection };
    }
    if (method === 'sessions.send') {
      return { runId: 'next-reply' };
    }
    if (method === 'workspace.snapshot') {
      return {
        snapshot: {
          projects: [{ id: 'project-1', title: 'Mibba', workspaceRoot: '/work/mibba' }],
          threads: [{ id: 'native-thread', projectId: 'project-1' }],
        },
      };
    }
    throw new Error(`Unexpected RPC ${method}`);
  });
}

it('opens a follow-up link with the whole conversation and its stable run identity', async () => {
  setupConversation();
  const detail = await getRunByPath({
    data: { project: 'mibba', thread: 'native-thread', runId: 'reply' },
  });
  expect(detail.run.id).toBe('first');
  expect(detail.messages.map((message) => message.text)).toEqual([
    'Run the audit',
    'Answer first',
    'My question',
    'Answer reply',
  ]);
});

it('keeps replies to completed runs on the originating conversation', async () => {
  setupConversation();
  const result = await sendRunFollowup({
    data: {
      threadId: 'native-thread',
      runId: 'reply',
      requestId: '4822b4aa-f6b7-49b3-8cf9-69e2ba59c083',
      text: 'Another question',
    },
  });
  expect(result.runId).toBe('first');
  expect(runtimeRpc).toHaveBeenCalledWith('sessions.send', {
    threadId: 'native-thread',
    agentId: 'operator',
    messageId: 'openfactory-run-message:reply:4822b4aa-f6b7-49b3-8cf9-69e2ba59c083',
    text: 'Another question',
  });
});
