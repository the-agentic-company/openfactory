import { pullRequestResultSchema } from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { nativeConnection } from './native-runtime.server';
import { readPullRequestSnapshot, savePullRequestSnapshot } from './pull-request-snapshots.server';
import { getAgents } from './agents';
import { loadRepositoryPullRequests, repositoryForWorkspace } from './github-pull-requests';

export const getPullRequests = createServerFn({ method: 'GET' })
  .validator(
    z.object({ project: z.string(), days: z.union([z.literal(1), z.literal(7), z.literal(30)]) }),
  )
  .handler(async ({ data }) => {
    const workspace = await getAgents();
    if (!workspace.connected) {
      throw new Error(workspace.error ?? 'Could not load factories.');
    }
    const projects = workspace.projects.filter(
      (project) => data.project === 'all' || project.workspaceRoot === data.project,
    );
    if (data.project !== 'all' && projects.length === 0) {
      throw new Error('This factory no longer exists.');
    }
    const discovered = await Promise.all(
      projects.map(async (project) => ({
        project,
        repository: await repositoryForWorkspace(project.workspaceRoot),
      })),
    );
    const repositories = [
      ...new Set(discovered.flatMap(({ repository }) => (repository ? [repository] : []))),
    ];
    const results = await Promise.allSettled(
      repositories.map(async (repository) => ({
        repository,
        pulls: await loadRepositoryPullRequests(repository, data.days),
      })),
    );
    const pulls = results
      .flatMap((result) => (result.status === 'fulfilled' ? result.value.pulls : []))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const result = pullRequestResultSchema.parse({
      pulls,
      repositories,
      unavailable: repositories.filter((_, index) => results[index]?.status === 'rejected'),
      unlinked: discovered
        .filter(({ repository }) => !repository)
        .map(({ project }) => project.title),
      limited: results.some(
        (result) => result.status === 'fulfilled' && result.value.pulls.length === 100,
      ),
    });
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
