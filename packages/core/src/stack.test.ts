import { describe, expect, it } from 'vite-plus/test';
import { selectStack, stack } from './index';

describe('stack selection boundary', () => {
  it('rejects unknown categories rather than silently returning the whole inventory', () => {
    expect(() => selectStack('Unknown')).toThrow();
    expect(() => selectStack({ category: 'All' })).toThrow();
  });

  it('returns only the requested category and preserves the complete inventory', () => {
    const before = structuredClone(stack);
    const frontend = selectStack('Frontend');
    expect(frontend.length).toBeGreaterThan(0);
    expect(frontend.every((entry) => entry.category === 'Frontend')).toBe(true);
    expect(frontend.length).toBeLessThan(selectStack('All').length);
    expect(stack).toEqual(before);
  });
});
