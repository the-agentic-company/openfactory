import {
  agentDefinition,
  agentSchema,
  factoryTeamSetups,
  parseAgentDefinition,
  validateFactoryFile,
} from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { savedDefinitionSchema } from '@openfactory/runtime/definitions';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';

async function loadDefinition(projectId: string) {
  const stored = savedDefinitionSchema.parse(await runtimeRpc('definitions.get', { projectId }));
  const { tasks } = z
    .object({ tasks: z.array(agentSchema) })
    .parse(await runtimeRpc('agents.list', {}));
  return {
    ...stored,
    projectId,
    files: Object.entries(stored.files).map(([path, source]) => {
      const agent = tasks.find((item) => item.id === stored.bindings[path]);
      return {
        path,
        source,
        agentId: stored.bindings[path] ?? null,
        liveSource: agent ? agentDefinition(agent) : null,
      };
    }),
  };
}
export const getFactoryDefinition = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(({ data }) => loadDefinition(data.projectId));

export const saveFactoryDefinitionFile = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      projectId: z.string().min(1),
      path: z.string().max(300),
      source: z.string().max(100000),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      expectedRuntime: z.string().max(20000).nullable(),
    }),
  )
  .handler(async ({ data }) => {
    validateFactoryFile(data.path, data.source);
    const current = await loadDefinition(data.projectId);
    const selected = current.files.find((file) => file.path === data.path);
    if (!selected) {
      throw new Error('This file no longer exists. Reload files.');
    }
    if (selected.agentId) {
      if (selected.liveSource !== data.expectedRuntime) {
        throw new Error('This definition changed since you opened it. Reload the definition.');
      }
      if (parseAgentDefinition(data.source).id !== selected.agentId) {
        throw new Error('Keep the existing agent id to preserve its history.');
      }
    }
    const files = Object.fromEntries(current.files.map((file) => [file.path, file.source]));
    files[data.path] = data.source;
    factoryTeamSetups(files, current.bindings);
    const result = savedDefinitionSchema.parse(
      await runtimeRpc('definitions.save', {
        projectId: data.projectId,
        revision: data.revision,
        files,
      }),
    );
    return { revision: result.revision, location: result.location, applied: true };
  });
