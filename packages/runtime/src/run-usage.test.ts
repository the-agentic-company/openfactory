import { describe, it, expect } from 'vite-plus/test';
import { parseProviderEvent } from './providers';
import { priceRunUsage } from './run-usage';
describe('per-run usage', () => {
  it('prices each disjoint token category and keeps unknown model costs unavailable', () => {
    const usage = { input: 1000, cached: 2000, cacheWrite: 100, output: 500, costUsd: null };
    const rates = {
      fetchedAtMs: 0,
      document: {
        test: {
          input_cost_per_token: 2e-6,
          output_cost_per_token: 10e-6,
          cache_read_input_token_cost: 0.2e-6,
          cache_creation_input_token_cost: 2.5e-6,
        },
      },
    };
    expect(priceRunUsage(usage, 'test', rates).costUsd).toBeCloseTo(0.00765);
    expect(priceRunUsage(usage, 'missing', rates).costUsd).toBeNull();
    expect(priceRunUsage({ ...usage, costUsd: 0 }, 'missing', rates).costUsd).toBe(0);
  });
  it('uses priority API prices and preserves Claude usage on failed results', () => {
    const usage = { input: 100, cached: 0, cacheWrite: 0, output: 10, costUsd: null };
    const rates = {
      fetchedAtMs: 0,
      document: {
        test: {
          input_cost_per_token: 1,
          output_cost_per_token: 2,
          input_cost_per_token_priority: 3,
          output_cost_per_token_priority: 4,
        },
      },
    };
    expect(priceRunUsage(usage, 'test', rates, 'priority').costUsd).toBe(340);
    expect(priceRunUsage(usage, 'test', rates, 'ultrafast').costUsd).toBeNull();
    const events = parseProviderEvent(
      'claude-code',
      JSON.stringify({
        type: 'result',
        session_id: 'test',
        is_error: true,
        errors: ['Interrupted'],
        total_cost_usd: 0.5,
        usage: { input_tokens: 100, output_tokens: 10 },
      }),
    );
    expect(events).toContainEqual({ type: 'usage', usage: { ...usage, costUsd: 0.5 } });
    expect(events).toContainEqual({ type: 'error', message: 'Interrupted' });
  });
});
