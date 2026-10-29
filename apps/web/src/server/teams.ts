import { randomUUID } from 'node:crypto';
import { factoryTeamSetups, resolvedTeamSchema, stringifyTeamDefinition } from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getFactoryDefinition } from './factory-definition';
import { saveDefinition } from './definition-store';
import { runtimeRpc } from './runtime-rpc';

export const getFactoryTeams = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) =>
    z.object({ teams: z.array(resolvedTeamSchema) }).parse(await runtimeRpc('teams.list', data)),
  );

export const createFactoryTeam = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      projectId: z.string().min(1),
      name: z.string().trim().min(1).max(100),
      slug: z
        .string()
        .regex(/^[a-z][a-z0-9-]*$/)
        .max(60),
      description: z.string().trim().min(1).max(400),
      leadAgentId: z.string().min(1),
      memberAgentIds: z.array(z.string().min(1)).min(1).max(24),
      instructions: z.string().max(16000),
    }),
  )
  .handler(async ({ data }) => {
    const current = await getFactoryDefinition({ data: { projectId: data.projectId } });
    const path = `teams/${data.slug}/team.yaml`;
    const files = Object.fromEntries(current.files.map((file) => [file.path, file.source]));
    if (files[path] !== undefined) {
      throw new Error('A team with this folder name already exists.');
    }
    const agentIds = [...new Set([data.leadAgentId, ...data.memberAgentIds])];
    const members: Record<string, { agent: string; reportsTo?: string }> = {};
    for (const [index, id] of agentIds.entries()) {
      const agentPath = Object.entries(current.bindings).find(([, agentId]) => agentId === id)?.[0];
      const file = current.files.find((item) => item.path === agentPath);
      if (!file?.liveSource) {
        throw new Error('Choose live agents from this factory.');
      }
      members[index === 0 ? 'lead' : `member-${index}`] = {
        agent: file.path,
        ...(index === 0 ? {} : { reportsTo: 'lead' }),
      };
    }
    files[path] = stringifyTeamDefinition({
      schemaVersion: 'v1alpha1',
      name: data.name,
      description: data.description,
      instructions: './instructions.md',
      lead: 'lead',
      members,
    });
    files[`teams/${data.slug}/instructions.md`] = data.instructions;
    const teams = factoryTeamSetups(files, current.bindings);
    await saveDefinition(
      data.projectId,
      current.revision,
      { files, bindings: current.bindings },
      () => runtimeRpc('teams.replace', { projectId: data.projectId, teams }),
    );
    return { path };
  });

export const runFactoryTeam = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      projectId: z.string().min(1),
      path: z.string().min(1),
      member: z.string().optional(),
    }),
  )
  .handler(async ({ data }) =>
    z
      .object({ runId: z.string(), threadId: z.string() })
      .parse(await runtimeRpc('teams.run', { ...data, requestId: randomUUID() })),
  );
