import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { createFactoryFiles, resolvedTeamSchema, stringifyTeamDefinition } from '@openfactory/core';
import { z } from 'zod';
import { AgentRuntime } from './runtime';
import { ownedAgentSchema } from './contracts';
import { applyTeamFile } from './team-files';
import { readDefinition } from './definition-store';

let directory: string;
let runtime: AgentRuntime;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'openfactory-team-files-'));
  vi.stubEnv('OPENFACTORY_SETTINGS_DIR', join(directory, 'settings'));
  runtime = new AgentRuntime(join(directory, 'runtime'));
  await runtime.rpc('projects.upsert', { id: 'mibba', title: 'Mibba', workspaceRoot: directory });
});
afterEach(async () => {
  await runtime.close();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it('applies a real team folder, preserves the agent schedule, and safely reapplies the same files', async () => {
  const agent = z.object({ task: ownedAgentSchema }).parse(
    await runtime.rpc('agents.upsert', {
      title: 'Operator',
      prompt: 'Investigate.',
      projectId: 'mibba',
      schedule: { type: 'interval', everyMs: 21600000 },
      enabled: true,
      modelSelection: { instanceId: 'codex', model: 'test' },
      runtimeMode: 'approval-required',
      interactionMode: 'default',
      workspaceStrategy: { type: 'root' },
    }),
  ).task;
  const agentPath = Object.keys(createFactoryFiles('Mibba', [agent]).bindings)[0];
  if (!agentPath) {
    throw new Error('Missing agent path');
  }
  await mkdir(join(directory, 'reliability'));
  const teamFile = join(directory, 'reliability/team.yaml');
  await writeFile(
    teamFile,
    stringifyTeamDefinition({
      schemaVersion: 'v1alpha1',
      name: 'Reliability',
      description: 'Operate the project.',
      instructions: './instructions.md',
      lead: 'operator',
      members: { operator: { agent: agentPath } },
    }),
  );
  await writeFile(join(directory, 'reliability/instructions.md'), 'Preserve approval holds.');
  const rpc = runtime.rpc.bind(runtime);
  const saved = await applyTeamFile('mibba', teamFile, rpc);
  expect(await applyTeamFile('mibba', teamFile, rpc)).toEqual(saved);
  expect(await readFile(join(saved.location, 'teams/reliability/instructions.md'), 'utf8')).toBe(
    'Preserve approval holds.',
  );
  expect(runtime.getAgent(agent.id)).toEqual(agent);
  expect(
    z
      .object({ teams: z.array(resolvedTeamSchema) })
      .parse(await rpc('teams.list', { projectId: 'mibba' })).teams[0]?.agents[0]?.agent.id,
  ).toBe(agent.id);
  const before = await readDefinition('mibba');
  await writeFile(
    teamFile,
    (await readFile(teamFile, 'utf8')).replace(agentPath, 'agents/missing/agent.md'),
  );
  await expect(applyTeamFile('mibba', teamFile, rpc)).rejects.toThrow('binding');
  expect(await readDefinition('mibba')).toEqual(before);
});
