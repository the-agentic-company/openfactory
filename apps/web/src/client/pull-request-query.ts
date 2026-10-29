import { notifyManager, queryOptions } from '@tanstack/react-query';
import {
  experimental_createQueryPersister,
  type AsyncStorage,
} from '@tanstack/query-persist-client-core';
import type { PullRequestResult } from '@openfactory/core';
import { queryStorage } from './query-storage';

export function createPullRequestPersister(storage: AsyncStorage | undefined) {
  const persisted = experimental_createQueryPersister({
    storage,
    buster: 'pull-requests-v1',
    prefix: 'openfactory-prs',
    maxAge: 30 * 86400000,
    refetchOnRestore: false,
  });
  const persisterFn: typeof persisted.persisterFn = async (load, context, query) => {
    let fetched = false;
    const data = await persisted.persisterFn(
      (context) => {
        fetched = true;
        return load(context);
      },
      context,
      query,
    );
    if (!fetched) {
      notifyManager.schedule(() => {
        void query.fetch().catch(() => {});
      });
    }
    return data;
  };
  return { ...persisted, persisterFn };
}
const persisted = createPullRequestPersister(
  typeof indexedDB === 'undefined' ? undefined : queryStorage,
);
export function pullRequestQueryOptions(
  scope: string,
  project: string,
  days: 1 | 7 | 30,
  load: () => Promise<PullRequestResult>,
  persister = persisted.persisterFn,
) {
  return queryOptions({
    queryKey: ['pull-requests', scope, project, days],
    queryFn: async ({ client, queryKey }) => {
      const result = await load();
      const previous = client.getQueryData<PullRequestResult>(queryKey);
      if (!previous || result.unavailable.length === 0) {
        return result;
      }
      const unavailable = new Set(result.unavailable);
      return {
        ...result,
        pulls: [
          ...previous.pulls.filter((pr) => unavailable.has(pr.repository)),
          ...result.pulls,
        ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      };
    },
    persister,
    refetchInterval: 60000,
    staleTime: 30000,
  });
}
