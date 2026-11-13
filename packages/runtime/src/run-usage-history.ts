import { createReadStream } from 'node:fs';
import { glob } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { threadHistorySchema } from '@openfactory/core';
import { createCodexUsageParser, estimateCost } from './usage-parser';
import { loadUsageRates, priceRunUsage } from './run-usage';

const nativeRef = z.object({ driver: z.string(), nativeId: z.string() }).passthrough().nullable();
const projectionSchema = threadHistorySchema
  .extend({
    thread: threadHistorySchema.shape.thread
      .extend({ nativeSessionId: z.string().nullish() })
      .passthrough(),
    runs: z.array(
      threadHistorySchema.shape.runs.element
        .extend({
          modelSelection: z
            .object({
              model: z.string(),
              options: z.object({ serviceTier: z.string().optional() }).passthrough().optional(),
            })
            .passthrough()
            .nullish(),
        })
        .passthrough(),
    ),
    messages: z.array(threadHistorySchema.shape.messages.element.passthrough()),
    providerThreads: z
      .array(z.object({ id: z.string(), nativeThreadRef: nativeRef }).passthrough())
      .default([]),
    providerTurns: z
      .array(
        z
          .object({
            providerThreadId: z.string(),
            runAttemptId: z.string(),
            nativeTurnRef: nativeRef,
          })
          .passthrough(),
      )
      .default([]),
    attempts: z.array(z.object({ id: z.string(), runId: z.string() }).passthrough()).default([]),
  })
  .passthrough();

let paths: { root: string; at: number; files: string[] } | undefined;
async function sessionFiles(root: string) {
  if (paths?.root === root && Date.now() - paths.at < 60_000) {
    return paths.files;
  }
  const files: string[] = [];
  try {
    for await (const file of glob('**/*.jsonl', { cwd: root })) {
      files.push(file);
    }
  } catch {
    return files;
  }
  paths = { root, at: Date.now(), files };
  return files;
}

export async function enrichRunUsage(raw: unknown) {
  const parsed = projectionSchema.safeParse(raw);
  if (!parsed.success) {
    return raw;
  }
  const projection = parsed.data;
  const rates = await loadUsageRates();
  const runs = projection.runs.map((run) => ({
    ...run,
    usage:
      run.usage && run.modelSelection
        ? priceRunUsage(
            run.usage,
            run.modelSelection.model,
            rates,
            run.modelSelection.options?.serviceTier,
          )
        : run.usage,
  }));
  const sessions = new Map<string, Map<string, string>>();
  for (const turn of projection.providerTurns) {
    if (turn.nativeTurnRef?.driver !== 'codex') {
      continue;
    }
    const attempt = projection.attempts.find((item) => item.id === turn.runAttemptId);
    const thread = projection.providerThreads.find((item) => item.id === turn.providerThreadId);
    if (!attempt || thread?.nativeThreadRef?.driver !== 'codex') {
      continue;
    }
    const turns = sessions.get(thread.nativeThreadRef.nativeId) ?? new Map<string, string>();
    turns.set(turn.nativeTurnRef.nativeId, attempt.runId);
    sessions.set(thread.nativeThreadRef.nativeId, turns);
  }
  if (!sessions.size) {
    return { ...projection, runs };
  }
  const root = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions');
  const files = await sessionFiles(root);
  const totals = new Map<
    string,
    { input: number; cached: number; cacheWrite: number; output: number; costUsd: number | null }
  >();
  for (const [session, turns] of sessions) {
    const path = files.find((file) => file.endsWith(`-${session}.jsonl`));
    if (!path) {
      continue;
    }
    const parse = createCodexUsageParser();
    try {
      const lines = createInterface({
        input: createReadStream(join(root, path)),
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        const record = parse(line);
        const runId = record && turns.get(record.turnId);
        if (!record || !runId) {
          continue;
        }
        const total = totals.get(runId) ?? {
          input: 0,
          cached: 0,
          cacheWrite: 0,
          output: 0,
          costUsd: 0,
        };
        total.input += record.input;
        total.cached += record.cached;
        total.cacheWrite += record.cacheWrite;
        total.output += record.output;
        const serviceTier = runs.find((run) => run.id === runId)?.modelSelection?.options
          ?.serviceTier;
        const cost = rates ? estimateCost(record, rates.document, serviceTier) : null;
        total.costUsd = cost !== null && total.costUsd !== null ? total.costUsd + cost : null;
        totals.set(runId, total);
      }
    } catch {
      // Unreadable transcripts leave usage unavailable rather than reporting zero.
      for (const runId of turns.values()) {
        totals.delete(runId);
      }
    }
  }
  return {
    ...projection,
    runs: runs.map((run) => ({ ...run, usage: run.usage ?? totals.get(run.id) ?? null })),
  };
}
