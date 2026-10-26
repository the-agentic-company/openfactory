export type RunBucket = 'running' | 'complete' | 'failed' | 'blocked' | 'cancelled' | 'other';
export function runBucket(status: string): RunBucket {
  if (['completed', 'succeeded'].includes(status)) {
    return 'complete';
  }
  if (['blocked', 'waiting', 'waiting_for_approval'].includes(status)) {
    return 'blocked';
  }
  if (['cancelled', 'canceled', 'interrupted'].includes(status)) {
    return 'cancelled';
  }
  if (['failed', 'errored'].includes(status)) {
    return 'failed';
  }
  if (['preparing', 'queued', 'starting', 'running'].includes(status)) {
    return 'running';
  }
  return 'other';
}
export function relativeRunTime(value: string, now: number) {
  const elapsed = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (elapsed < 60) {
    return 'just now';
  }
  if (elapsed < 3600) {
    const n = Math.floor(elapsed / 60);
    return `${n} minute${n === 1 ? '' : 's'} ago`;
  }
  if (elapsed < 86400) {
    const n = Math.floor(elapsed / 3600);
    return `${n} hour${n === 1 ? '' : 's'} ago`;
  }
  const n = Math.floor(elapsed / 86400);
  return `${n} day${n === 1 ? '' : 's'} ago`;
}
export function runLinks(text: string) {
  const links = new Map<string, { url: string; label: string; kind: 'pr' | 'link' }>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"`]+/g)) {
    try {
      const url = new URL(match[0].replace(/[),.;!?\]]+$/, ''));
      if (url.username || url.password) {
        continue;
      }
      const pr =
        url.hostname === 'github.com'
          ? /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url.pathname)
          : null;
      const key = pr ? `${url.origin}/${pr[1]}/${pr[2]}/pull/${pr[3]}` : url.href;
      links.set(key, {
        url: key,
        label: pr
          ? `${pr[1]}/${pr[2]}#${pr[3]}`
          : `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`,
        kind: pr ? 'pr' : 'link',
      });
    } catch {
      /* Ignore incomplete links in streamed text. */
    }
  }
  return [...links.values()];
}
