import { z } from 'zod';

const count = z.number().int().nonnegative().default(0);
const envelope = z.object({ timestamp: z.string(), type: z.string(), payload: z.unknown() });
const context = z.object({ turn_id: z.string(), model: z.string() });
const tokenEvent = z.object({
  type: z.literal('token_count'),
  info: z.object({
    last_token_usage: z.object({
      input_tokens: count,
      cached_input_tokens: count,
      cache_write_input_tokens: count,
      output_tokens: count,
      reasoning_output_tokens: count,
    }),
  }),
});
export type UsageRecord = {
  turnId: string;
  model: string;
  timestamp: string;
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
};

// Read every context, including other agents sharing the same provider session.
export function createCodexUsageParser() {
  let turn: z.infer<typeof context> | null = null;
  let signature = '';
  return (line: string): UsageRecord | null => {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return null;
    }
    const parsed = envelope.safeParse(raw);
    if (!parsed.success) {
      return null;
    }
    const event = parsed.data;
    if (event.type === 'turn_context') {
      turn = context.safeParse(event.payload).data ?? null;
      return null;
    }
    if (event.type !== 'event_msg' || !turn) {
      return null;
    }
    const usage = tokenEvent.safeParse(event.payload);
    if (!usage.success) {
      return null;
    }
    const tokens = usage.data.info.last_token_usage;
    const nextSignature = JSON.stringify(tokens);
    if (signature === nextSignature) {
      return null;
    }
    signature = nextSignature;
    return {
      turnId: turn.turn_id,
      model: turn.model,
      timestamp: event.timestamp,
      input: Math.max(
        0,
        tokens.input_tokens - tokens.cached_input_tokens - tokens.cache_write_input_tokens,
      ),
      cached: tokens.cached_input_tokens,
      cacheWrite: tokens.cache_write_input_tokens,
      output: tokens.output_tokens,
      reasoning: Math.min(tokens.output_tokens, tokens.reasoning_output_tokens),
    };
  };
}

const rate = z.object({
  input_cost_per_token: z.number().nonnegative(),
  output_cost_per_token: z.number().nonnegative(),
  cache_read_input_token_cost: z.number().nonnegative().optional(),
  cache_creation_input_token_cost: z.number().nonnegative().optional(),
});
export const ratesSchema = z.object({
  fetchedAtMs: z.number(),
  document: z.record(z.string(), z.unknown()),
});
export function estimateCost(
  record: UsageRecord,
  document: z.infer<typeof ratesSchema>['document'],
) {
  const parsed = rate.safeParse(document[record.model] ?? document[`openai/${record.model}`]);
  if (!parsed.success) {
    return null;
  }
  const prices = parsed.data;
  return (
    record.input * prices.input_cost_per_token +
    record.cached * (prices.cache_read_input_token_cost ?? prices.input_cost_per_token) +
    record.cacheWrite * (prices.cache_creation_input_token_cost ?? prices.input_cost_per_token) +
    record.output * prices.output_cost_per_token
  );
}
