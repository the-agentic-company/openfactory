import { agentDefinition, agentSchema } from '@openfactory/core';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';

vi.mock('./runtime-rpc', () => ({ runtimeRpc: vi.fn() }));

import { applyAgentDefinition } from './apply-agent-definition.server';
import { runtimeRpc } from './runtime-rpc';

const raw = {
  id: 'agent',
  title: 'Review',
  prompt: 'Review changes.',
  enabled: false,
  schedule: { type: 'interval', everyMs: 60000 },
  projectId: 'project',
  threadId: 'thread',
  modelSelection: { instanceId: 'codex', model: 'test', options: { reasoning: 'high' } },
  workspaceStrategy: { type: 'root' },
  runtimeMode: 'full-access',
  interactionMode: 'default',
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: 'never',
  lastRunError: null,
  runCount: 0,
};
const agent = agentSchema.parse(raw);

beforeEach(() => {
  vi.mocked(runtimeRpc).mockReset();
  vi.mocked(runtimeRpc).mockImplementation(async (method, input) => {
    if (method === 'agents.list') {
      return { tasks: [raw] };
    }
    return { task: { ...raw, ...z.record(z.string(), z.unknown()).parse(input) } };
  });
});

describe('saving agent schedules', () => {
  it('applies an inline schedule while preserving runtime settings and paused state', async () => {
    const schedule = { type: 'fixed_time', timeOfDay: '09:30', weekdays: [1, 3, 5] };
    const source = agentDefinition(agentSchema.parse({ ...raw, schedule }));
    const saved = await applyAgentDefinition({
      id: agent.id,
      source,
      expectedSource: agentDefinition(agent),
    });
    expect(saved.schedule).toEqual(schedule);
    expect(runtimeRpc).toHaveBeenCalledWith('agents.upsert', {
      id: raw.id,
      expectedSource: agentDefinition(agent),
      title: raw.title,
      prompt: raw.prompt,
      schedule,
      enabled: false,
      projectId: raw.projectId,
      threadId: raw.threadId,
      workspaceStrategy: raw.workspaceStrategy,
      modelSelection: raw.modelSelection,
      runtimeMode: raw.runtimeMode,
      interactionMode: raw.interactionMode,
    });
  });

  it('preserves the live schedule when older definitions omit it', async () => {
    const saved = await applyAgentDefinition({
      id: agent.id,
      source: '---\n---\nReview changes.',
      expectedSource: agentDefinition(agent),
    });
    expect(saved.schedule).toEqual(raw.schedule);
  });

  it('rejects stale edits after the live schedule changes', async () => {
    const source = agentDefinition(agentSchema.parse({ ...raw, schedule: { type: 'webhook' } }));
    await expect(
      applyAgentDefinition({ id: agent.id, source, expectedSource: source }),
    ).rejects.toThrow('changed since you opened it');
    expect(runtimeRpc).toHaveBeenCalledTimes(1);
  });
});
