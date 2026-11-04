import { agentUpdateFromDefinition } from '@openfactory/client';
import { agentDefinition, agentSchema } from '@openfactory/core';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';

export async function applyAgentDefinition(data: {
  id: string;
  source: string;
  expectedSource: string;
}) {
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
  const result = await runtimeRpc(
    'agents.upsert',
    agentUpdateFromDefinition(agent, data.source, data.expectedSource),
  );
  return z.object({ task: agentSchema }).parse(result).task;
}
