import { describe, expect, it } from 'vite-plus/test';
import { relativeRunTime, runBucket, runLinks } from './run-view';
describe('run presentation', () => {
  it('keeps blocked and cancelled runs out of the running bucket', () => {
    expect(['preparing', 'queued', 'starting', 'running'].map(runBucket)).toEqual([
      'running',
      'running',
      'running',
      'running',
    ]);
    expect(runBucket('waiting')).toBe('blocked');
    expect(runBucket('interrupted')).toBe('cancelled');
    expect(runBucket('completed')).toBe('complete');
    expect(runBucket('failed')).toBe('failed');
  });
  it('formats elapsed time with explicit time input', () => {
    const now = Date.parse('2026-10-28T12:00:00Z');
    expect(relativeRunTime('2026-10-28T11:59:30Z', now)).toBe('just now');
    expect(relativeRunTime('2026-10-28T11:00:00Z', now)).toBe('1 hour ago');
    expect(relativeRunTime('2026-10-26T12:00:00Z', now)).toBe('2 days ago');
  });
  it('extracts real referenced PRs, deduplicates anchors, and ignores embedded credentials', () => {
    expect(
      runLinks(
        'See [PR](https://github.com/warp/app/pull/12), https://github.com/warp/app/pull/12#review and https://docs.warp.dev/factories. https://user:secret@example.com/private',
      ),
    ).toEqual([
      { url: 'https://github.com/warp/app/pull/12', label: 'warp/app#12', kind: 'pr' },
      { url: 'https://docs.warp.dev/factories', label: 'docs.warp.dev/factories', kind: 'link' },
    ]);
    expect(runLinks('javascript:alert(1) file:///etc/passwd')).toEqual([]);
  });
});
