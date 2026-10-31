import { createReadStream } from 'node:fs';
import { glob } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { threadHistorySchema } from '@openfactory/core';
import { createCodexUsageParser } from './agent-usage-parser';
import { loadFactoryRuns } from './factory-runs.server';

const projectionSchema = z.object({
  thread: z.object({ id: z.string() }),
  providerThreads: z
    .array(
      z.object({
        id: z.string(),
        nativeThreadRef: z.object({ driver: z.string(), nativeId: z.string() }).nullable(),
      }),
    )
    .default([]),
  providerTurns: z
    .array(
      z.object({
        providerThreadId: z.string(),
        runAttemptId: z.string(),
        nativeTurnRef: z.object({ driver: z.string(), nativeId: z.string() }).nullable(),
      }),
    )
    .default([]),
  attempts: z.array(z.object({ id: z.string(), runId: z.string() })).default([]),
});
const directProjectionSchema = threadHistorySchema.extend({
  runs: z.array(
    threadHistorySchema.shape.runs.element.extend({
      modelSelection: z.object({ model: z.string() }),
    }),
  ),
});
const emptyTotals = () => ({
  uncachedInputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  outputTokens: 0,
});
type Bucket = { day: string; model: string; totals: ReturnType<typeof emptyTotals> };

export async function loadFactoryUsage(data: {
  project: string;
  sinceDay: string;
  untilDay: string;
  timeZone: string;
}) {
  const history = await loadFactoryRuns(data.project);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: data.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dayKey = (value: string) => {
    const parts = formatter.formatToParts(new Date(value));
    return ['year', 'month', 'day']
      .map((type) => parts.find((part) => part.type === type)?.value)
      .join('-');
  };
  const runs = history.runs.filter((run) => {
    const day = dayKey(run.requestedAt);
    return day >= data.sinceDay && day <= data.untilDay;
  });
  const buckets = new Map<string, Bucket>();
  const directRunIds = new Set<string>();
  let missingDirect = 0;
  for (const raw of history.histories) {
    const parsed = directProjectionSchema.safeParse(raw);
    if (!parsed.success || parsed.data.thread.runtime !== 'openfactory') {
      continue;
    }
    const projection = parsed.data;
    for (const run of projection.runs) {
      const owned = runs.find((item) => item.id === run.id);
      if (!owned) {
        continue;
      }
      directRunIds.add(run.id);
      if (!run.usage) {
        if (run.status === 'completed') {
          missingDirect++;
        }
        continue;
      }
      const day = dayKey(run.requestedAt);
      const model = run.modelSelection.model;
      const key = JSON.stringify([day, model]);
      const bucket = buckets.get(key) ?? { day, model, totals: emptyTotals() };
      bucket.totals.uncachedInputTokens += run.usage.input;
      bucket.totals.cachedInputTokens += run.usage.cached;
      bucket.totals.cacheCreationTokens += run.usage.cacheWrite;
      bucket.totals.outputTokens += run.usage.output;
      buckets.set(key, bucket);
    }
  }
  const sessions = new Map<string, Set<string>>();
  let unmapped = 0;
  for (const raw of history.histories) {
    const projection = projectionSchema.parse(raw);
    const owned = new Set(
      runs
        .filter((run) => run.threadId === projection.thread.id && !directRunIds.has(run.id))
        .map((run) => run.id),
    );
    const attempts = projection.attempts.filter((attempt) => owned.has(attempt.runId));
    const mappedRuns = new Set<string>();
    for (const turn of projection.providerTurns) {
      const attempt = attempts.find((item) => item.id === turn.runAttemptId);
      if (!attempt || turn.nativeTurnRef?.driver !== 'codex') {
        continue;
      }
      const thread = projection.providerThreads.find((item) => item.id === turn.providerThreadId);
      if (thread?.nativeThreadRef?.driver !== 'codex') {
        continue;
      }
      const session = thread.nativeThreadRef.nativeId;
      const turns = sessions.get(session) ?? new Set<string>();
      turns.add(turn.nativeTurnRef.nativeId);
      sessions.set(session, turns);
      mappedRuns.add(attempt.runId);
    }
    unmapped += owned.size - mappedRuns.size;
  }
  const measured = new Map<string, Set<string>>();
  const foundSessions = new Set<string>();
  const root = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  if (sessions.size) {
    for await (const path of glob('**/*.jsonl', { cwd: join(root, 'sessions') })) {
      const session = [...sessions.keys()].find((id) => path.endsWith(`-${id}.jsonl`));
      if (!session || foundSessions.has(session)) {
        continue;
      }
      const parse = createCodexUsageParser();
      try {
        const lines = createInterface({
          input: createReadStream(join(root, 'sessions', path)),
          crlfDelay: Infinity,
        });
        for await (const line of lines) {
          const record = parse(line);
          if (!record || !sessions.get(session)?.has(record.turnId)) {
            continue;
          }
          const day = dayKey(record.timestamp);
          if (day < data.sinceDay || day > data.untilDay) {
            continue;
          }
          const key = JSON.stringify([day, record.model]);
          const bucket = buckets.get(key) ?? { day, model: record.model, totals: emptyTotals() };
          bucket.totals.uncachedInputTokens += record.input;
          bucket.totals.cachedInputTokens += record.cached;
          bucket.totals.cacheCreationTokens += record.cacheWrite;
          bucket.totals.outputTokens += record.output;
          buckets.set(key, bucket);
          const turns = measured.get(session) ?? new Set<string>();
          turns.add(record.turnId);
          measured.set(session, turns);
        }
        foundSessions.add(session);
      } catch {
        // Missing transcripts leave their turns unmeasured and coverage incomplete.
      }
    }
  }
  const incomplete =
    history.limited ||
    history.unavailable > 0 ||
    unmapped > 0 ||
    missingDirect > 0 ||
    [...sessions].some(([session, turns]) =>
      [...turns].some((turn) => !measured.get(session)?.has(turn)),
    );
  const status = incomplete ? (buckets.size ? 'partial' : 'missing') : 'ok';
  return {
    readAt: new Date().toISOString(),
    buckets: [...buckets.values()].sort(
      (a, b) => a.day.localeCompare(b.day) || a.model.localeCompare(b.model),
    ),
    sources: [{ status }],
  };
}
