import { createReadStream } from 'node:fs';
import { glob, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { projectAgentRuns, threadHistorySchema } from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createCodexUsageParser, estimateCost, ratesSchema } from './agent-usage-parser';

const projectionSchema = threadHistorySchema.extend({
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
export const getAgentUsage = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      id: z.string().min(1),
      sinceDay: z.iso.date(),
      untilDay: z.iso.date(),
      timeZone: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { loadAgentProjections } = await import('./agent-projections.server');
    const { agent, projections, truncated } = await loadAgentProjections(data.id);
    const sessions = new Map<string, Set<string>>();
    const runs = projections.flatMap((p) => projectAgentRuns(p, agent.id, agent.threadId));
    for (const raw of projections) {
      const p = projectionSchema.parse(raw);
      // Only explicitly tagged runs count: shared coordinator turns have ambiguous ownership.
      const owned = new Set(runs.filter((r) => r.source === 't3').map((r) => r.id));
      const attempts = new Set(p.attempts.filter((a) => owned.has(a.runId)).map((a) => a.id));
      for (const turn of p.providerTurns) {
        if (!attempts.has(turn.runAttemptId) || turn.nativeTurnRef?.driver !== 'codex') {
          continue;
        }
        const thread = p.providerThreads.find((t) => t.id === turn.providerThreadId);
        if (thread?.nativeThreadRef?.driver !== 'codex') {
          continue;
        }
        const id = thread.nativeThreadRef.nativeId;
        const turns = sessions.get(id) ?? new Set<string>();
        turns.add(turn.nativeTurnRef.nativeId);
        sessions.set(id, turns);
      }
    }
    const dayFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: data.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dayKey = (value: string) => {
      const parts = dayFormatter.formatToParts(new Date(value));
      return ['year', 'month', 'day']
        .map((type) => parts.find((part) => part.type === type)?.value)
        .join('-');
    };
    const rates = await readFile(
      process.env.OPENFACTORY_USAGE_RATES_FILE ??
        join(homedir(), '.t3/userdata/usage-model-rates.json'),
      'utf8',
    )
      .then((raw) => ratesSchema.parse(JSON.parse(raw)))
      .catch(() => null);
    const totals = {
      input: 0,
      cached: 0,
      cacheWrite: 0,
      output: 0,
      reasoning: 0,
      costUsd: 0,
      unpriced: 0,
      records: 0,
    };
    const measuredTurns = new Set<string>();
    const foundSessions = new Set<string>();
    const root = process.env.CODEX_HOME ?? join(homedir(), '.codex');
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
          totals.input += record.input;
          totals.cached += record.cached;
          totals.cacheWrite += record.cacheWrite;
          totals.output += record.output;
          totals.reasoning += record.reasoning;
          totals.records++;
          const cost = rates ? estimateCost(record, rates.document) : null;
          if (cost === null) {
            totals.unpriced++;
          } else {
            totals.costUsd += cost;
          }
          measuredTurns.add(record.turnId);
        }
        foundSessions.add(session);
      } catch {
        /* Missing or unreadable transcripts are reported as partial coverage below. */
      }
    }
    let missingDirect = false;
    for (const raw of projections) {
      const projection = threadHistorySchema.parse(raw);
      if (projection.thread.runtime !== 'openfactory') {
        continue;
      }
      for (const run of projection.runs) {
        const day = dayKey(run.requestedAt);
        if (day < data.sinceDay || day > data.untilDay) {
          continue;
        }
        if (!run.usage) {
          if (run.status === 'completed') {
            missingDirect = true;
          }
          continue;
        }
        totals.input += run.usage.input;
        totals.cached += run.usage.cached;
        totals.cacheWrite += run.usage.cacheWrite;
        totals.output += run.usage.output;
        totals.records++;
        if (run.usage.costUsd === null) {
          totals.unpriced++;
        } else {
          totals.costUsd += run.usage.costUsd;
        }
        measuredTurns.add(run.id);
      }
    }
    const recent = runs.filter(
      (r) =>
        ['t3', 'openfactory'].includes(r.source) &&
        dayKey(r.requestedAt) >= data.sinceDay &&
        dayKey(r.requestedAt) <= data.untilDay,
    );
    return {
      ...totals,
      total: totals.input + totals.cached + totals.cacheWrite + totals.output,
      runs: recent.length,
      completed: recent.filter((r) => ['completed', 'succeeded'].includes(r.status)).length,
      failed: recent.filter((r) => r.status === 'failed').length,
      partial:
        truncated ||
        missingDirect ||
        foundSessions.size < sessions.size ||
        (recent.some((run) => run.source === 't3') && sessions.size === 0),
      measuredTurns: measuredTurns.size,
      pricingAt: rates ? new Date(rates.fetchedAtMs).toISOString() : null,
    };
  });
