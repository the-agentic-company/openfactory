import { loadUsageRates, priceRunUsage } from '@openfactory/runtime/run-usage';
import { runDetailProjectionSchema } from '@openfactory/core';
import { readFactoryRuns } from '@openfactory/client';
import { runtimeRpc } from './runtime-rpc';

export async function loadFactoryRuns(project: string) {
  const [result, rates] = await Promise.all([
    readFactoryRuns(project, runtimeRpc),
    loadUsageRates(),
  ]);
  const models = new Map(
    result.histories.flatMap((raw) => {
      const parsed = runDetailProjectionSchema.safeParse(raw);
      return parsed.success
        ? parsed.data.runs.flatMap((run) =>
            run.modelSelection ? [[run.id, run.modelSelection] as const] : [],
          )
        : [];
    }),
  );
  return {
    ...result,
    runs: result.runs.map((run) => {
      const model = models.get(run.id);
      return {
        ...run,
        usage:
          run.usage && model
            ? priceRunUsage(
                run.usage,
                model.model,
                rates,
                typeof model.options?.serviceTier === 'string'
                  ? model.options.serviceTier
                  : 'default',
              )
            : run.usage,
      };
    }),
  };
}
