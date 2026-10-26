import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { t3Rpc } from './t3-rpc';

const count = z.number().int().nonnegative();
const usageSchema = z.object({
  readAt: z.string(),
  buckets: z.array(
    z.object({
      day: z.string(),
      model: z.string(),
      totals: z.object({
        uncachedInputTokens: count,
        cachedInputTokens: count,
        cacheCreationTokens: count,
        outputTokens: count,
      }),
    }),
  ),
  sources: z.array(z.object({ status: z.enum(['ok', 'missing', 'partial', 'failed']) })),
});

export const getTokenUsage = createServerFn({ method: 'GET' })
  .validator(
    z.object({ sinceDay: z.iso.date(), untilDay: z.iso.date(), timeZone: z.string().min(1) }),
  )
  .handler(async ({ data }) => usageSchema.parse(await t3Rpc('server.getUsageSummary', data)));
