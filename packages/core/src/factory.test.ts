import { describe, expect, it } from 'vite-plus/test';
import { agentAppearanceSchema, scorerSchema, scoreOutput } from './factory';

describe('run output rules', () => {
  it('checks required and excluded text without case sensitivity', () => {
    expect(
      scoreOutput(
        { type: 'contains', text: 'OPENFACTORY_INTERVAL_OK' },
        'Result: openfactory_interval_ok',
      ),
    ).toBe(true);
    expect(scoreOutput({ type: 'contains', text: 'OPENFACTORY_INTERVAL_OK' }, 'Run failed')).toBe(
      false,
    );
    expect(scoreOutput({ type: 'excludes', text: 'ERROR' }, 'An error occurred')).toBe(false);
    expect(scoreOutput({ type: 'excludes', text: 'ERROR' }, 'Completed')).toBe(true);
  });
  it('counts user-visible characters for minimum length', () => {
    expect(scoreOutput({ type: 'min_length', length: 2 }, '🛡️')).toBe(false);
    expect(scoreOutput({ type: 'min_length', length: 2 }, '🛡️!')).toBe(true);
  });
  it('rejects invalid rules and icon names at the boundary', () => {
    expect(scorerSchema.shape.rule.safeParse({ type: 'contains', text: '   ' }).success).toBe(
      false,
    );
    expect(scorerSchema.shape.rule.safeParse({ type: 'min_length', length: 0 }).success).toBe(
      false,
    );
    expect(agentAppearanceSchema.safeParse({ kind: 'icon', name: '../outside' }).success).toBe(
      false,
    );
    expect(agentAppearanceSchema.parse({ kind: 'emoji', value: '🧪' })).toEqual({
      kind: 'emoji',
      value: '🧪',
    });
  });
});
