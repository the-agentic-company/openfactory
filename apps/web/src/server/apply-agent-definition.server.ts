import { agentDefinition, agentSchema, parseAgentDefinition } from '@openfactory/core';
import { z } from 'zod';
import { t3Rpc } from './t3-rpc';

export async function applyAgentDefinition(data: {
  id: string;
  source: string;
  expectedSource: string;
}) {
  const definition = parseAgentDefinition(data.source);
  const { tasks } = z
    .object({ tasks: z.array(z.record(z.string(), z.unknown())) })
    .parse(await t3Rpc('scheduledTasks.list', {}));
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
  const requestedType =
    definition.harness?.type === 'claude-code' ? 'claude' : definition.harness?.type;
  const currentType =
    agent.modelSelection.instanceId === 'claude-code' ? 'claude' : agent.modelSelection.instanceId;
  if (requestedType && requestedType !== currentType) {
    throw new Error(
      'The harness type must match the current T3 provider. Switching providers is not supported here.',
    );
  }
  const result = await t3Rpc('scheduledTasks.upsert', {
    id: agent.id,
    title: definition.description ?? agent.title,
    prompt: definition.prompt,
    enabled: agent.enabled,
    schedule: raw.schedule,
    projectId: agent.projectId,
    threadId: agent.threadId,
    workspaceStrategy: raw.workspaceStrategy,
    modelSelection: {
      ...z.record(z.string(), z.unknown()).parse(raw.modelSelection),
      model: definition.harness?.model ?? agent.modelSelection.model,
    },
    runtimeMode: raw.runtimeMode,
    interactionMode: raw.interactionMode,
  });
  return z.object({ task: agentSchema }).parse(result).task;
}
