import { createTeamFiles } from '@openfactory/client';
import { randomUUID } from 'node:crypto';
import { resolvedTeamSchema } from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getFactoryDefinition } from './factory-definition';
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
    const { files, path } = createTeamFiles(
      {
        files: Object.fromEntries(current.files.map((file) => [file.path, file.source])),
        bindings: current.bindings,
      },
      data,
    );
    await runtimeRpc('definitions.save', {
      projectId: data.projectId,
      revision: current.revision,
      files,
    });
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
