import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ validator: () => ({ handler: (handler: unknown) => handler }) }),
}));
vi.mock('./runtime-rpc', () => ({ runtimeRpc: vi.fn() }));
import { getTokenUsage } from './usage';
import { runtimeRpc } from './runtime-rpc';

const agent = (id: string, projectId: string) => ({
  id,
  projectId,
  title: id,
  prompt: 'Work',
  enabled: true,
  schedule: { type: 'interval', everyMs: 60000 },
  threadId: 'shared',
  modelSelection: { instanceId: 'codex', model: 'test' },
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: 'never',
  lastRunError: null,
  runCount: 0,
});
const owners = ['factory-agent', undefined, 'other-agent', 'unknown-agent', 'second-agent'];
const request = { sinceDay: '2026-10-29', untilDay: '2026-10-29', timeZone: 'UTC' };
let root: string;
const previousHome = process.env.CODEX_HOME;

const events = (
  turn: string,
  output: number,
  model = 'model-a',
  timestamp = '2026-10-29T10:00:00Z',
) => [
  { timestamp, type: 'turn_context', payload: { turn_id: turn, model } },
  {
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 60,
          cache_write_input_tokens: 10,
          output_tokens: output,
        },
      },
    },
  },
];
const transcript = async (records: ReturnType<typeof events>) => {
  await writeFile(
    join(root, 'sessions', 'rollout-session.jsonl'),
    records.map((record) => JSON.stringify(record)).join('\n'),
  );
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'factory-usage-'));
  process.env.CODEX_HOME = root;
  await mkdir(join(root, 'sessions'));
  await transcript([
    ...events('turn-0', 20),
    ...events('turn-1', 9000, 'unrelated-model'),
    ...events('turn-2', 30, 'other-model'),
    ...events('turn-3', 9000, 'unknown-model'),
    ...events('turn-4', 40, 'model-b'),
    ...events('turn-0', 9000, 'outside-period', '2026-10-28T10:00:00Z'),
  ]);
  vi.mocked(runtimeRpc).mockReset();
  vi.mocked(runtimeRpc).mockImplementation(async (method, payload) => {
    if (method === 'agents.list') {
      return {
        tasks: [
          agent('factory-agent', 'factory'),
          agent('second-agent', 'factory'),
          agent('other-agent', 'other'),
        ],
      };
    }
    if (method === 'workspace.snapshot') {
      return {
        snapshot: {
          projects: ['factory', 'other', 'empty'].map((id) => ({ id, workspaceRoot: `/${id}` })),
          threads: ['factory', 'other', 'empty'].map((projectId) => ({
            id: projectId === 'factory' ? 'shared' : projectId,
            projectId,
            title: 'Conversation',
            createdAt: '2026-10-29T10:00:00Z',
          })),
        },
      };
    }
    if (method !== 'sessions.read') {
      throw new Error(`Unexpected RPC: ${method}`);
    }
    const { threadId } = z.object({ threadId: z.string() }).parse(payload);
    return {
      projection: {
        thread: { id: threadId, title: 'Conversation' },
        runs: owners.map((_, i) => ({
          id: `run-${i}`,
          ordinal: i + 1,
          userMessageId: `message-${i}`,
          status: 'completed',
          requestedAt: '2026-10-29T10:00:00Z',
          startedAt: null,
          completedAt: null,
        })),
        messages: owners.map((scheduledTaskId, i) => ({
          id: `message-${i}`,
          runId: `run-${i}`,
          role: 'user',
          text: 'Work',
          createdAt: '2026-10-29T10:00:00Z',
          ...(scheduledTaskId ? { scheduledTaskId } : {}),
        })),
        attempts: owners.map((_, i) => ({ id: `attempt-${i}`, runId: `run-${i}` })),
        providerThreads: [
          { id: 'provider', nativeThreadRef: { driver: 'codex', nativeId: 'session' } },
        ],
        providerTurns: owners.map((_, i) => ({
          providerThreadId: 'provider',
          runAttemptId: `attempt-${i}`,
          nativeTurnRef: { driver: 'codex', nativeId: `turn-${i}` },
        })),
      },
    };
  });
});
afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = previousHome;
  }
  await rm(root, { recursive: true, force: true });
});

describe('factory token usage', () => {
  it.each(['/factory', 'factory'])(
    'counts only agent runs in %s, even in a shared provider session',
    async (project) => {
      const result = await getTokenUsage({ data: { ...request, project } });
      expect(result.buckets).toEqual([
        {
          day: '2026-10-29',
          model: 'model-a',
          totals: {
            uncachedInputTokens: 30,
            cachedInputTokens: 60,
            cacheCreationTokens: 10,
            outputTokens: 20,
          },
        },
        {
          day: '2026-10-29',
          model: 'model-b',
          totals: {
            uncachedInputTokens: 30,
            cachedInputTokens: 60,
            cacheCreationTokens: 10,
            outputTokens: 40,
          },
        },
      ]);
      expect(result.sources).toEqual([{ status: 'ok' }]);
      expect(
        vi.mocked(runtimeRpc).mock.calls.every(([method]) => method !== 'server.getUsageSummary'),
      ).toBe(true);
    },
  );

  it('switches factories without including the previous factory’s tokens', async () => {
    const result = await getTokenUsage({ data: { ...request, project: '/other' } });
    expect(result.buckets).toEqual([
      {
        day: '2026-10-29',
        model: 'other-model',
        totals: {
          uncachedInputTokens: 30,
          cachedInputTokens: 60,
          cacheCreationTokens: 10,
          outputTokens: 30,
        },
      },
    ]);
  });

  it('returns zero usage for a factory with no agents', async () => {
    const result = await getTokenUsage({ data: { ...request, project: '/empty' } });
    expect(result.buckets).toEqual([]);
    expect(result.sources).toEqual([{ status: 'ok' }]);
  });

  it('reports missing factory transcripts without falling back to global usage', async () => {
    await rm(join(root, 'sessions', 'rollout-session.jsonl'));
    const result = await getTokenUsage({ data: { ...request, project: '/factory' } });
    expect(result.buckets).toEqual([]);
    expect(result.sources).toEqual([{ status: 'missing' }]);
  });

  it('reports partial coverage when an owned turn has no usage', async () => {
    await transcript(events('turn-0', 20));
    const result = await getTokenUsage({ data: { ...request, project: '/factory' } });
    expect(result.buckets).toHaveLength(1);
    expect(result.sources).toEqual([{ status: 'partial' }]);
  });
});
