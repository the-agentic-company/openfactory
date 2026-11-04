import {
  agentDefinition,
  parseAgentDefinition,
  factoryTeamSetups,
  stringifyTeamDefinition,
  type Agent,
} from '@openfactory/core';
import { upsertSchema } from '@openfactory/protocol/contracts';

export function agentUpdateFromDefinition(agent: Agent, source: string, expectedSource: string) {
  if (agentDefinition(agent) !== expectedSource) {
    throw new Error('This definition changed. Copy your edits, then reload it.');
  }
  const definition = parseAgentDefinition(source);
  return upsertSchema.parse({
    ...agent,
    expectedSource,
    title: definition.description ?? agent.title,
    prompt: definition.prompt,
    enabled: definition.enabled ?? agent.enabled,
    schedule: definition.schedule ?? agent.schedule,
    workspaceStrategy: agent.workspaceStrategy ?? { type: 'root' },
    modelSelection: {
      ...agent.modelSelection,
      instanceId: definition.harness?.type ?? agent.modelSelection.instanceId,
      model: definition.harness?.model ?? agent.modelSelection.model,
    },
    runtimeMode: definition.runtimeMode ?? agent.runtimeMode ?? 'approval-required',
    interactionMode: agent.interactionMode ?? 'default',
  });
}

export function createTeamFiles(
  current: { files: Record<string, string>; bindings: Record<string, string> },
  input: {
    name: string;
    slug: string;
    description: string;
    leadAgentId: string;
    memberAgentIds: string[];
    instructions: string;
  },
) {
  if (!/^[a-z][a-z0-9-]{0,59}$/.test(input.slug)) {
    throw new Error('Use a folder name with lowercase letters, numbers, and hyphens.');
  }
  const path = `teams/${input.slug}/team.yaml`;
  if (path in current.files) {
    throw new Error('A team with this folder name already exists.');
  }
  const members: Record<string, { agent: string; reportsTo?: string }> = {};
  const ids = [...new Set([input.leadAgentId, ...input.memberAgentIds])];
  for (const [index, id] of ids.entries()) {
    const agent = Object.entries(current.bindings).find(([, value]) => value === id)?.[0];
    if (!agent || !(agent in current.files)) {
      throw new Error('Choose live agents from this factory.');
    }
    members[index === 0 ? 'lead' : `member-${index}`] = {
      agent,
      ...(index === 0 ? {} : { reportsTo: 'lead' }),
    };
  }
  const files = {
    ...current.files,
    [path]: stringifyTeamDefinition({
      schemaVersion: 'v1alpha1',
      name: input.name,
      description: input.description,
      instructions: './instructions.md',
      lead: 'lead',
      members,
    }),
    [`teams/${input.slug}/instructions.md`]: input.instructions,
  };
  factoryTeamSetups(files, current.bindings);
  return { files, path };
}
