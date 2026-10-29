import { describe, expect, it } from 'vite-plus/test';
import { createCodexUsageParser, estimateCost } from './agent-usage-parser';

const context = (turn: string) =>
  JSON.stringify({
    timestamp: '2026-10-28T08:00:00Z',
    type: 'turn_context',
    payload: { turn_id: turn, model: 'gpt-6.1-sol' },
  });
const tokens = (output = 20) =>
  JSON.stringify({
    timestamp: '2026-10-28T08:01:00Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 60,
          cache_write_input_tokens: 10,
          output_tokens: output,
          reasoning_output_tokens: 15,
        },
      },
    },
  });

describe('agent transcript usage', () => {
  it('attributes shared-session records to their native turn and suppresses stream repeats', () => {
    const parse = createCodexUsageParser();
    parse(context('digest'));
    expect(parse(tokens())).toEqual({
      turnId: 'digest',
      model: 'gpt-6.1-sol',
      timestamp: '2026-10-28T08:01:00Z',
      input: 30,
      cached: 60,
      cacheWrite: 10,
      output: 20,
      reasoning: 15,
    });
    expect(parse(tokens())).toBeNull();
    parse(context('operator'));
    expect(parse(tokens())?.turnId).toBe('operator');
    expect(parse(tokens(25))?.turnId).toBe('operator');
    expect(parse('incomplete JSON')).toBeNull();
  });
  it('prices disjoint token categories without adding reasoning twice', () => {
    const parse = createCodexUsageParser();
    parse(context('digest'));
    const record = parse(tokens());
    expect(record).not.toBeNull();
    if (!record) {
      throw new Error('Expected transcript usage');
    }
    expect(
      estimateCost(record, {
        'gpt-6.1-sol': {
          input_cost_per_token: 2,
          output_cost_per_token: 10,
          cache_read_input_token_cost: 0.1,
          cache_creation_input_token_cost: 2.5,
        },
      }),
    ).toBe(291);
    expect(estimateCost(record, {})).toBeNull();
  });
});
