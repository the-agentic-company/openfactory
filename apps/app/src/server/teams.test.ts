import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { AgentRuntime } from '../../../../packages/runtime/src/runtime';
import { ownedAgentSchema } from '@openfactory/runtime/contracts';
import { getAgents } from './agents';
import { runtimeRpc } from './runtime-rpc';
import { createFactoryTeam, getFactoryTeams } from './teams';
import { getFactoryDefinition, saveFactoryDefinitionFile } from './factory-definition';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}));

vi.mock('./agents', () => ({ getAgents: vi.fn() }));
vi.mock('./runtime-rpc', () => ({ runtimeRpc: vi.fn() }));
let runtime: AgentRuntime;
let directory: string;
let lead: string;
let reporter: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'openfactory-team-server-'));
  vi.stubEnv('OPENFACTORY_SETTINGS_DIR', join(directory, 'settings'));
  runtime = new AgentRuntime(join(directory, 'runtime'));
  await runtime.rpc('projects.upsert', { id: 'mibba', title: 'Mibba', workspaceRoot: directory });
  const ids: string[] = [];
  for (const title of ['Operator', 'Digest']) {
    const task = z.object({ task: ownedAgentSchema }).parse(
      await runtime.rpc('agents.upsert', {
        title,
        prompt: `${title} instructions`,
        projectId: 'mibba',
        enabled: true,
        schedule: { type: 'interval', everyMs: 21600000 },
        modelSelection: { instanceId: 'codex', model: 'test' },
        runtimeMode: 'approval-required',
        interactionMode: 'default',
        workspaceStrategy: { type: 'root' },
      }),
    ).task;
    ids.push(task.id);
  }
  [lead, reporter] = z.tuple([z.string(), z.string()]).parse(ids);
  vi.mocked(runtimeRpc).mockImplementation((method, input) => runtime.rpc(method, input));
  vi.mocked(getAgents).mockImplementation(async () => ({
    agents: [runtime.getAgent(lead), runtime.getAgent(reporter)],
    projects: [
      {
        id: 'mibba',
        title: 'Mibba',
        workspaceRoot: directory,
        icon: { kind: 'icon', name: 'factory' },
      },
    ],
    appearances: {},
    connected: true,
    native: false,
    cacheScope: 'test',
    error: null,
    syncedAt: new Date().toISOString(),
  }));
});
afterEach(async () => {
  await runtime.close();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
const create = () =>
  createFactoryTeam({
    data: {
      projectId: 'mibba',
      name: 'Reliability',
      slug: 'reliability',
      description: 'Observe operational health.',
      leadAgentId: lead,
      memberAgentIds: [lead, reporter],
      instructions: 'Preserve approvals.',
    },
  });

describe('factory team endpoints', () => {
  it('creates saved references to actual agents and applies shared guidance on edit', async () => {
    const before = runtime.getAgent(lead);
    const created = await create();
    expect(created.path).toBe('teams/reliability/team.yaml');
    const team = (await getFactoryTeams({ data: { projectId: 'mibba' } })).teams[0];
    expect(team?.agents.map((member) => member.agent.id)).toEqual([lead, reporter]);
    expect(team?.instructions).toBe('Preserve approvals.');
    const definition = await getFactoryDefinition({ data: { projectId: 'mibba' } });
    expect(definition.files.map((file) => file.path)).toContain(
      'teams/reliability/instructions.md',
    );
    await saveFactoryDefinitionFile({
      data: {
        projectId: 'mibba',
        path: 'teams/reliability/instructions.md',
        source: 'Require review.',
        revision: definition.revision,
        expectedRuntime: null,
      },
    });
    expect((await getFactoryTeams({ data: { projectId: 'mibba' } })).teams[0]?.instructions).toBe(
      'Require review.',
    );
    expect(runtime.getAgent(lead)).toEqual(before);
    await expect(create()).rejects.toThrow('already exists');
  });
  it('rejects unavailable members and stale edits without changing the applied team', async () => {
    await create();
    const definition = await getFactoryDefinition({ data: { projectId: 'mibba' } });
    const source = definition.files.find(
      (file) => file.path === 'teams/reliability/team.yaml',
    )?.source;
    if (!source) {
      throw new Error('Missing team file');
    }
    const before = await getFactoryTeams({ data: { projectId: 'mibba' } });
    const agentPath = before.teams[0]?.agents[1]?.agentPath;
    if (!agentPath) {
      throw new Error('Missing member');
    }
    await expect(
      saveFactoryDefinitionFile({
        data: {
          projectId: 'mibba',
          path: 'teams/reliability/team.yaml',
          source: source.replace(agentPath, 'agents/missing/agent.md'),
          revision: definition.revision,
          expectedRuntime: null,
        },
      }),
    ).rejects.toThrow('binding');
    expect(await getFactoryTeams({ data: { projectId: 'mibba' } })).toEqual(before);
    await saveFactoryDefinitionFile({
      data: {
        projectId: 'mibba',
        path: 'teams/reliability/instructions.md',
        source: 'New guidance',
        revision: definition.revision,
        expectedRuntime: null,
      },
    });
    await expect(
      saveFactoryDefinitionFile({
        data: {
          projectId: 'mibba',
          path: 'teams/reliability/team.yaml',
          source,
          revision: definition.revision,
          expectedRuntime: null,
        },
      }),
    ).rejects.toThrow('another editor');
    expect((await getFactoryTeams({ data: { projectId: 'mibba' } })).teams[0]?.instructions).toBe(
      'New guidance',
    );
    await expect(
      createFactoryTeam({
        data: {
          projectId: 'mibba',
          name: 'Bad',
          slug: 'bad',
          description: 'Invalid member',
          leadAgentId: 'not-in-factory',
          memberAgentIds: [lead],
          instructions: '',
        },
      }),
    ).rejects.toThrow('live agents');
  });
});
