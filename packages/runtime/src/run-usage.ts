import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ratesSchema, estimateCost } from './usage-parser';
import { usageSchema } from './contracts';

let pendingRates: Promise<z.infer<typeof ratesSchema> | null> | undefined;
let nextRefresh = 0;
export function loadUsageRates() {
  if (pendingRates && Date.now() < nextRefresh) {
    return pendingRates;
  }
  nextRefresh = Date.now() + 3600_000;
  pendingRates = (async () => {
    const path =
      process.env.OPENFACTORY_USAGE_RATES_FILE ??
      join(homedir(), '.openfactory', 'usage-model-rates.json');
    const read = (file: string) =>
      readFile(file, 'utf8')
        .then((raw) => ratesSchema.parse(JSON.parse(raw)))
        .catch(() => null);
    const cached =
      (await read(path)) ?? (await read(join(homedir(), '.t3/userdata/usage-model-rates.json')));
    if (
      process.env.OPENFACTORY_USAGE_RATES_FILE ||
      (cached && Date.now() - cached.fetchedAtMs < 86400_000)
    ) {
      return cached;
    }
    try {
      const response = await fetch(
        'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) {
        return cached;
      }
      const rates = ratesSchema.parse({ fetchedAtMs: Date.now(), document: await response.json() });
      await mkdir(join(homedir(), '.openfactory'), { recursive: true, mode: 0o700 });
      await writeFile(path, JSON.stringify(rates), { mode: 0o600 });
      return rates;
    } catch {
      return cached;
    }
  })();
  return pendingRates;
}

export function priceRunUsage(
  usage: z.infer<typeof usageSchema>,
  model: string,
  rates: z.infer<typeof ratesSchema> | null,
  serviceTier = 'default',
) {
  return {
    ...usage,
    costUsd:
      usage.costUsd ??
      (rates
        ? estimateCost(
            { ...usage, model, turnId: '', timestamp: '', reasoning: 0 },
            rates.document,
            serviceTier,
          )
        : null),
  };
}
