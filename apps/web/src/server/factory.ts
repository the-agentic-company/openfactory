import { randomUUID } from 'node:crypto';
import { agentAppearanceSchema, agentSchema, scorerSchema } from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';
import {
  readScorers,
  removeScorer,
  writeAppearance,
  writeScorer,
  writeFactoryProfile,
} from './factory-store';
import { factoryProfileSchema } from '../factory-profile';

export const deleteFactory = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    return z.object({ deleted: z.boolean() }).parse(await runtimeRpc('projects.delete', data));
  });

export const updateFactoryProfile = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1), profile: factoryProfileSchema }))
  .handler(async ({ data }) => {
    const shell = z
      .object({ snapshot: z.object({ projects: z.array(z.object({ id: z.string() })) }) })
      .parse(await runtimeRpc('workspace.snapshot', {}));
    if (!shell.snapshot.projects.some((project) => project.id === data.id)) {
      throw new Error('This factory no longer exists. Refresh and try again.');
    }
    await writeFactoryProfile(data.id, data.profile);
    return data.profile;
  });

export const setAgentAppearance = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1), appearance: agentAppearanceSchema }))
  .handler(async ({ data }) => {
    const { tasks } = z
      .object({ tasks: z.array(agentSchema) })
      .parse(await runtimeRpc('agents.list', {}));
    if (!tasks.some((task) => task.id === data.id)) {
      throw new Error('This agent no longer exists.');
    }
    await writeAppearance(data.id, data.appearance);
    return data.appearance;
  });
export const getScorers = createServerFn({ method: 'GET' }).handler(() => readScorers());
export const createScorer = createServerFn({ method: 'POST' })
  .validator(scorerSchema.omit({ id: true, createdAt: true }))
  .handler(async ({ data }) => {
    const scorer = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
    await writeScorer(scorer);
    return scorer;
  });
export const deleteScorer = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await removeScorer(data.id);
    return { deleted: true };
  });
export const getFactoryRuns = createServerFn({ method: 'GET' })
  .validator(z.object({ project: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { loadFactoryRuns } = await import('./factory-runs.server');
    const { histories: _histories, ...result } = await loadFactoryRuns(data.project);
    return result;
  });
