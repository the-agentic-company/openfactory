import { it, expect, vi } from 'vite-plus/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enrichRunUsage } from './run-usage-history';
import { threadHistorySchema, runDetailProjectionSchema } from '@openfactory/core';
it('recovers mapped native turns, deduplicates snapshots, and uses priority prices', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'run-usage-history-'));
  try {
    vi.stubEnv('CODEX_HOME', directory);
    vi.stubEnv('OPENFACTORY_USAGE_RATES_FILE', join(directory, 'rates.json'));
    await writeFile(
      join(directory, 'rates.json'),
      JSON.stringify({
        fetchedAtMs: Date.now(),
        document: {
          test: {
            input_cost_per_token: 0.001,
            output_cost_per_token: 0.002,
            input_cost_per_token_priority: 0.002,
            output_cost_per_token_priority: 0.004,
          },
        },
      }),
    );
    await mkdir(join(directory, 'sessions'));
    const event = (type: string, payload: unknown) =>
      JSON.stringify({ type, payload, timestamp: '2026-11-12T00:00:00Z' });
    const context = (turn_id: string) => event('turn_context', { turn_id, model: 'test' });
    const tokens = (total: number) =>
      event('event_msg', {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 10, output_tokens: 2 },
          total_token_usage: { input_tokens: total, output_tokens: total / 5 },
        },
      });
    await writeFile(
      join(directory, 'sessions', 'rollout-native-session.jsonl'),
      [
        context('mapped-turn'),
        tokens(10),
        tokens(10),
        tokens(20),
        context('other-turn'),
        tokens(30),
      ].join('\n'),
    );
    const result = threadHistorySchema.parse(
      await enrichRunUsage({
        thread: { id: 'thread', title: 'History' },
        runs: [
          {
            id: 'run',
            modelSelection: { model: 'test', options: { serviceTier: 'priority' } },
            ordinal: 1,
            userMessageId: 'message',
            status: 'completed',
            requestedAt: '2026-11-12T00:00:00Z',
            startedAt: null,
            completedAt: null,
          },
        ],
        messages: [],
        attempts: [{ id: 'attempt', runId: 'run' }],
        providerThreads: [
          { id: 'provider', nativeThreadRef: { driver: 'codex', nativeId: 'native-session' } },
        ],
        providerTurns: [
          {
            providerThreadId: 'provider',
            runAttemptId: 'attempt',
            nativeTurnRef: { driver: 'codex', nativeId: 'mapped-turn' },
          },
        ],
      }),
    );
    expect(result.runs[0]?.usage).toEqual({
      input: 20,
      cached: 0,
      cacheWrite: 0,
      output: 4,
      costUsd: 0.056,
    });
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it('preserves archived attachments and provider metadata while enriching usage', async () => {
  const attachment = {
    id: 'image',
    type: 'image',
    name: 'result.png',
    mimeType: 'image/png',
    sizeBytes: 100,
  };
  const projection = {
    thread: { id: 'thread', title: 'History', projectId: 'project' },
    runs: [],
    messages: [
      {
        id: 'message',
        runId: null,
        role: 'assistant',
        text: 'Result',
        createdAt: '2026-11-12T00:00:00Z',
        attachments: [attachment],
      },
    ],
    providerThreads: [{ id: 'provider', nativeThreadRef: null, status: 'idle' }],
    providerTurns: [
      {
        providerThreadId: 'provider',
        runAttemptId: 'attempt',
        nativeTurnRef: null,
        tokenUsage: { usedTokens: 42 },
      },
    ],
    attempts: [{ id: 'attempt', runId: 'run', status: 'completed' }],
  };
  const result = await enrichRunUsage(projection);
  expect(runDetailProjectionSchema.parse(result).messages[0]?.attachments).toEqual([attachment]);
  expect(result).toMatchObject({
    providerThreads: projection.providerThreads,
    providerTurns: projection.providerTurns,
    attempts: projection.attempts,
  });
});
