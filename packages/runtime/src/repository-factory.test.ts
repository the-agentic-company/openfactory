import { mkdtemp, mkdir, readFile, writeFile, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { agentDefinition } from '@openfactory/core';
import { AgentRuntime } from './runtime';
import { ownedAgentSchema, runSchema } from './contracts';
import { readDefinition } from './definition-store';
let directory: string;
let runtime: AgentRuntime;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'openfactory-repositories-'));
  runtime = new AgentRuntime(join(directory, 'runtime'));
  for (const id of ['one', 'two']) {
    await mkdir(join(directory, id));
    await runtime.rpc('projects.upsert', { id, title: id, workspaceRoot: join(directory, id) });
  }
});
afterEach(async () => {
  await runtime.close();
  await rm(directory, { recursive: true, force: true });
});
async function create(projectId = 'one') {
  return z.object({ task: ownedAgentSchema }).parse(
    await runtime.rpc('agents.upsert', {
      projectId,
      title: 'Reviewer',
      prompt: 'Review carefully.',
      schedule: { type: 'manual' },
      enabled: false,
      modelSelection: { instanceId: 'codex', model: 'test', options: { reasoningEffort: 'high' } },
      runtimeMode: 'approval-required',
      interactionMode: 'default',
      workspaceStrategy: { type: 'root' },
    }),
  ).task;
}
it('writes agent creation, settings and pause/resume into each owning repository', async () => {
  const agent = await create();
  const other = await create('two');
  const definition = readDefinition(join(directory, 'one'));
  const path =
    Object.entries(definition?.bindings ?? {}).find(([, id]) => id === agent.id)?.[0] ?? '';
  await runtime.rpc('agents.setEnabled', { id: agent.id, enabled: true });
  expect(await readFile(join(directory, 'one/factory', path), 'utf8')).toContain('enabled: true');
  expect(readDefinition(join(directory, 'two'))?.bindings).not.toHaveProperty(path);
  expect(runtime.getAgent(other.id).enabled).toBe(false);
  await runtime.rpc('agents.upsert', {
    ...agent,
    prompt: 'New instructions',
    modelSelection: agent.modelSelection,
  });
  expect(await readFile(join(directory, 'one/factory', path), 'utf8')).toContain(
    'New instructions',
  );
});
it('loads external edits and removes deleted agents without discarding history', async () => {
  const agent = await create();
  const definition = readDefinition(join(directory, 'one'));
  const path = Object.keys(definition?.bindings ?? {})[0] ?? '';
  await writeFile(
    join(directory, 'one/factory', path),
    agentDefinition({ ...agent, prompt: 'Edited in my editor.' }),
  );
  expect(await runtime.rpc('agents.list', {})).toMatchObject({
    tasks: [{ id: agent.id, prompt: 'Edited in my editor.' }],
  });
  expect(runtime.getAgent(agent.id).modelSelection.options).toEqual({ reasoningEffort: 'high' });
  await rm(join(directory, 'one/factory', path));
  expect(await runtime.rpc('agents.list', {})).toEqual({ tasks: [] });
  await expect(runtime.rpc('agents.run', { id: agent.id, requestId: 'removed' })).rejects.toThrow(
    'repository definition',
  );
  expect(runtime.getAgent(agent.id).enabled).toBe(false);
});
it('registers a fresh checkout from its files and rejects duplicate repository ownership', async () => {
  const agent = await create();
  await runtime.close();
  await cp(join(directory, 'one/factory'), join(directory, 'clone/factory'), { recursive: true });
  runtime = new AgentRuntime(join(directory, 'fresh-runtime'));
  await runtime.rpc('projects.upsert', {
    id: 'clone',
    title: 'clone',
    workspaceRoot: join(directory, 'clone'),
  });
  expect(await runtime.rpc('agents.list', {})).toMatchObject({
    tasks: [{ id: agent.id, prompt: agent.prompt, projectId: 'clone' }],
  });
  await expect(
    runtime.rpc('projects.upsert', {
      id: 'duplicate',
      title: 'duplicate',
      workspaceRoot: join(directory, 'clone'),
    }),
  ).rejects.toThrow('already has a factory');
});

it('cancels queued turns when their agent definition is removed', async () => {
  const agent = await create();
  const definition = readDefinition(join(directory, 'one'));
  const path = Object.keys(definition?.bindings ?? {})[0] ?? '';
  runtime.store.put(
    'runs',
    'queued-run',
    runSchema.parse({
      id: 'queued-run',
      agentId: agent.id,
      threadId: 'queued-thread',
      ordinal: 1,
      userMessageId: 'queued-message',
      status: 'queued',
      requestedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      modelSelection: agent.modelSelection,
      error: null,
      usage: null,
    }),
  );
  await rm(join(directory, 'one/factory', path));
  runtime.tick();
  expect(runtime.store.get('runs', 'queued-run', runSchema)).toMatchObject({
    status: 'interrupted',
    error: 'The agent definition was removed from the repository.',
  });
});

it('rejects a second factory registered through a symlink to an existing repository', async () => {
  const alias = join(directory, 'alias');
  await symlink(join(directory, 'one'), alias, 'dir');
  await expect(
    runtime.rpc('projects.upsert', { id: 'alias', title: 'Alias', workspaceRoot: alias }),
  ).rejects.toThrow('already has a factory');
});
