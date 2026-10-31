import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { QueryClient, QueryObserver, hashKey } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vite-plus/test';
import type { PullRequestResult } from '@openfactory/core';
import { createPullRequestPersister, pullRequestQueryOptions } from '../client/pull-request-query';
import { openQueryStorage } from '../client/query-storage';

const saved = {
  pulls: [
    {
      number: 42,
      title: 'Saved pull request',
      url: 'https://github.com/team/repo/pull/42',
      repository: 'team/repo',
      state: 'OPEN',
      author: 'developer',
      updatedAt: '2026-10-29T12:00:00Z',
      review: '',
      checks: 'passed',
      additions: 3,
      deletions: 1,
    },
  ],
  repositories: ['team/repo'],
  unavailable: [],
  unlinked: [],
  limited: false,
} satisfies PullRequestResult;
const cleanup: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});
async function storage(name = `prs${randomUUID().replaceAll('-', '')}`) {
  const opened = await openQueryStorage(name);
  cleanup.push(opened.close);
  return { ...opened, name };
}
function client() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cleanup.push(() => queryClient.clear());
  return queryClient;
}

it('shows saved PRs after reopening IndexedDB before a slow GitHub refresh finishes', async () => {
  const firstStorage = await storage();
  const firstPersister = createPullRequestPersister(firstStorage.storage);
  const first = client();
  const firstOptions = pullRequestQueryOptions(
    'host-a',
    '/repo',
    30,
    async () => saved,
    firstPersister.persisterFn,
  );
  await first.fetchQuery(firstOptions);
  const key = `openfactory-prs-${hashKey(firstOptions.queryKey)}`;
  await expect.poll(() => firstStorage.storage.getItem(key)).not.toBeNull();
  first.clear();
  await firstStorage.close();
  cleanup.splice(cleanup.indexOf(firstStorage.close), 1);

  const reopened = await storage(firstStorage.name);
  const persister = createPullRequestPersister(reopened.storage);
  const second = client();
  let finish = (_data: PullRequestResult) => {};
  const pending = new Promise<PullRequestResult>((resolve) => {
    finish = resolve;
  });
  let requested = false;
  const observer = new QueryObserver(
    second,
    pullRequestQueryOptions(
      'host-a',
      '/repo',
      30,
      () => {
        requested = true;
        return pending;
      },
      persister.persisterFn,
    ),
  );
  cleanup.push(observer.subscribe(() => {}));
  await expect
    .poll(() => observer.getCurrentResult().data?.pulls[0]?.title)
    .toBe('Saved pull request');
  await expect.poll(() => requested).toBe(true);
  expect(observer.getCurrentResult().isPending).toBe(false);
  finish({
    ...saved,
    pulls: [{ ...saved.pulls[0], title: 'Fresh GitHub result', checks: 'failed' }],
  });
  await expect
    .poll(() => observer.getCurrentResult().data?.pulls[0]?.title)
    .toBe('Fresh GitHub result');
  expect(observer.getCurrentResult().data?.pulls[0]?.checks).toBe('failed');
});

it('retains saved rows when the background GitHub refresh fails', async () => {
  const opened = await storage();
  const persister = createPullRequestPersister(opened.storage);
  const first = client();
  const options = pullRequestQueryOptions(
    'host',
    '/repo',
    30,
    async () => saved,
    persister.persisterFn,
  );
  await first.fetchQuery(options);
  await persister.persistQueryByKey(options.queryKey, first);
  const second = client();
  const observer = new QueryObserver(
    second,
    pullRequestQueryOptions(
      'host',
      '/repo',
      30,
      () => Promise.reject(new Error('GitHub unavailable')),
      persister.persisterFn,
    ),
  );
  cleanup.push(observer.subscribe(() => {}));
  await expect.poll(() => observer.getCurrentResult().isRefetchError).toBe(true);
  expect(observer.getCurrentResult().data?.pulls[0]?.title).toBe('Saved pull request');
});

it('separates host, factory, and date-range caches', async () => {
  const opened = await storage();
  const persister = createPullRequestPersister(opened.storage);
  const first = client();
  const options = pullRequestQueryOptions(
    'host-a',
    '/repo',
    30,
    async () => saved,
    persister.persisterFn,
  );
  await first.fetchQuery(options);
  await persister.persistQueryByKey(options.queryKey, first);
  for (const [scope, project, days] of [
    ['host-b', '/repo', 30],
    ['host-a', '/other', 30],
    ['host-a', '/repo', 7],
  ] satisfies [string, string, 1 | 7 | 30][]) {
    const second = client();
    const empty = { ...saved, pulls: [] };
    expect(
      await second.fetchQuery(
        pullRequestQueryOptions(scope, project, days, async () => empty, persister.persisterFn),
      ),
    ).toEqual(empty);
  }
});

it('discards malformed persisted PR data and fetches a valid response', async () => {
  const opened = await storage();
  const persister = createPullRequestPersister(opened.storage);
  const queryClient = client();
  const options = pullRequestQueryOptions(
    'host',
    '/repo',
    30,
    async () => saved,
    persister.persisterFn,
  );
  const key = `openfactory-prs-${hashKey(options.queryKey)}`;
  await opened.storage.setItem(
    key,
    JSON.stringify({
      buster: 'pull-requests-v1',
      state: { data: { pulls: [{ state: 'INVALID' }] } },
    }),
  );
  expect(await queryClient.fetchQuery(options)).toEqual(saved);
});

it('keeps cached rows from repositories GitHub could not refresh', async () => {
  const opened = await storage();
  const persister = createPullRequestPersister(opened.storage);
  const queryClient = client();
  const options = pullRequestQueryOptions(
    'host',
    '/repo',
    30,
    async () => saved,
    persister.persisterFn,
  );
  await queryClient.fetchQuery(options);
  const result = await queryClient.fetchQuery({
    ...pullRequestQueryOptions(
      'host',
      '/repo',
      30,
      async () => ({ ...saved, pulls: [], unavailable: ['team/repo'] }),
      persister.persisterFn,
    ),
    staleTime: 0,
  });
  expect(result.pulls[0]?.title).toBe('Saved pull request');
  expect(result.unavailable).toEqual(['team/repo']);
});
