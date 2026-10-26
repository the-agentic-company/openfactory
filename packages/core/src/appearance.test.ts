import { describe, expect, it } from 'vite-plus/test';
import { agentAppearanceSchema, firstEmoji } from './appearance';

describe('icon and emoji selection', () => {
  it.each(['🧑🏽‍💻', '🇫🇷', '1️⃣', '🛡️', '👨‍👩‍👧‍👦'])('preserves the complete %s emoji', (value) => {
    expect(firstEmoji(`${value} hello`)).toBe(value);
    expect(agentAppearanceSchema.parse({ kind: 'emoji', value })).toEqual({ kind: 'emoji', value });
  });
  it('rejects text, multiple emoji, invalid colors and paths', () => {
    for (const value of ['hello', '🧪🚀']) {
      expect(agentAppearanceSchema.safeParse({ kind: 'emoji', value }).success).toBe(false);
    }
    expect(
      agentAppearanceSchema.safeParse({ kind: 'icon', name: '../outside', color: 'blue' }).success,
    ).toBe(false);
    expect(
      agentAppearanceSchema.safeParse({ kind: 'icon', name: 'folder-code', color: 'nope' }).success,
    ).toBe(false);
  });
  it('normalizes monograms and validates their visible length', () => {
    expect(
      agentAppearanceSchema.parse({ kind: 'monogram', text: '  é2 ', color: 'orange' }),
    ).toEqual({ kind: 'monogram', text: 'É2', color: 'orange' });
    for (const text of ['', 'ABC', 'A!', '🧪']) {
      expect(
        agentAppearanceSchema.safeParse({ kind: 'monogram', text, color: 'blue' }).success,
      ).toBe(false);
    }
    expect(
      agentAppearanceSchema.parse({ kind: 'icon', name: 'folder-code', color: 'teal' }),
    ).toEqual({ kind: 'icon', name: 'folder-code', color: 'teal' });
  });
});
