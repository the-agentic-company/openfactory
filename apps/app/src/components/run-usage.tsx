import type { z } from 'zod';
import type { threadHistorySchema } from '@openfactory/core';
import './run-usage.css';

type Run = z.infer<typeof threadHistorySchema>['runs'][number];
const number = new Intl.NumberFormat(undefined);
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
export function apiCost(value: number | null | undefined) {
  if (value == null) {
    return 'Unavailable';
  }
  if (value > 0 && value < 0.0001) {
    return '<$0.0001';
  }
  return currency.format(value);
}
export function RunUsage({ run }: { run: Pick<Run, 'usage'> }) {
  const usage = run.usage;
  return (
    <section className="run-usage" aria-label="Run usage and cost">
      <h2>Usage &amp; cost</h2>
      <dl>
        <div className="run-usage-cost">
          <dt>API-equivalent cost</dt>
          <dd>{apiCost(usage?.costUsd)}</dd>
        </div>
        <div>
          <dt>Input</dt>
          <dd>{usage ? number.format(usage.input) : '—'}</dd>
        </div>
        <div>
          <dt>Cached input</dt>
          <dd>{usage ? number.format(usage.cached) : '—'}</dd>
        </div>
        <div>
          <dt>Cache writes</dt>
          <dd>{usage ? number.format(usage.cacheWrite) : '—'}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{usage ? number.format(usage.output) : '—'}</dd>
        </div>
      </dl>
      <p>USD estimate at model API rates, with cache pricing. This is not a subscription charge.</p>
    </section>
  );
}
