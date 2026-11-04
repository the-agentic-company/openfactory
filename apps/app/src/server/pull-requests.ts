import { pullRequestResultSchema } from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { nativeConnection } from './native-runtime.server';
import { readPullRequestSnapshot, savePullRequestSnapshot } from './pull-request-snapshots.server';
import { getAgents } from './agents';
import { runtimeRpc } from './runtime-rpc';

export const getPullRequests = createServerFn({ method: 'GET' })
  .validator(
    z.object({ project: z.string(), days: z.union([z.literal(1), z.literal(7), z.literal(30)]) }),
  )
  .handler(async ({ data }) => {
    const workspace = await getAgents();
    if (!workspace.connected) {
      throw new Error(workspace.error ?? 'Could not load factories.');
    }
    const result = pullRequestResultSchema.parse(await runtimeRpc('pullRequests.list', data));
    if (result.unavailable.length === 0) {
      await savePullRequestSnapshot({
        ...data,
        scope: workspace.cacheScope,
        updatedAt: Date.now(),
        result,
      }).catch(() => {});
    }
    return result;
  });

export const getPullRequestSnapshot = createServerFn({ method: 'GET' })
  .validator(
    z.object({ project: z.string(), days: z.union([z.literal(1), z.literal(7), z.literal(30)]) }),
  )
  .handler(async ({ data }) => {
    const scope = (await nativeConnection())?.origin ?? 'local';
    const cached = await readPullRequestSnapshot({ ...data, scope });
    if (cached) {
      return cached;
    }
    const result = await getPullRequests({ data });
    return { ...data, scope, updatedAt: Date.now(), result };
  });
