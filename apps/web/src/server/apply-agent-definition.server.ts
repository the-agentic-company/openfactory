import { agentDefinition, agentSchema, parseAgentDefinition } from '@openfactory/core';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';

export async function applyAgentDefinition(data: {
  id: string;
  source: string;
  expectedSource: string;
}) {
  const definition = parseAgentDefinition(data.source);
  const { tasks } = z
    .object({ tasks: z.array(z.record(z.string(), z.unknown())) })
    .parse(await runtimeRpc('agents.list', {}));
  const raw = tasks.find((task) => task.id === data.id);
  if (!raw) {
    throw new Error('This agent no longer exists.');
  }
  const agent = agentSchema.parse(raw);
  if (agentDefinition(agent) !== data.expectedSource) {
    throw new Error(
      'This definition changed since you opened it. Copy your edits, then reload the definition.',
    );
  }
  const result = await runtimeRpc('agents.upsert', {
    id: agent.id,
    expectedSource: data.expectedSource,
    title: definition.description ?? agent.title,
    prompt: definition.prompt,
    enabled: definition.enabled ?? agent.enabled,
    schedule: definition.schedule ?? raw.schedule,
    projectId: agent.projectId,
    threadId: agent.threadId,
    workspaceStrategy: raw.workspaceStrategy,
    modelSelection: {
      ...z.record(z.string(), z.unknown()).parse(raw.modelSelection),
      instanceId: definition.harness?.type ?? agent.modelSelection.instanceId,
      model: definition.harness?.model ?? agent.modelSelection.model,
    },
    runtimeMode: definition.runtimeMode ?? raw.runtimeMode,
    interactionMode: raw.interactionMode,
  });
  return z.object({ task: agentSchema }).parse(result).task;
}
