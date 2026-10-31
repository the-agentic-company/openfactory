import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { AgentRuntime } from '../../../../packages/runtime/src/runtime';
import { ownedAgentSchema } from '@openfactory/runtime/contracts';
import {
  readAppearances,
  readScorers,
  readFactoryProfiles,
  removeScorer,
  writeAppearance,
  writeScorer,
  writeFactoryProfile,
} from './factory-store';
import { runtimeRpc } from './runtime-rpc';
vi.mock('./runtime-rpc', () => ({ runtimeRpc: vi.fn() }));
let directory: string;
let runtime: AgentRuntime;
let agentId: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'openfactory-workspace-test-'));
  runtime = new AgentRuntime(join(directory, 'runtime'));
  for (const id of ['one', 'two']) {
    await mkdir(join(directory, id));
    await runtime.rpc('projects.upsert', { id, title: id, workspaceRoot: join(directory, id) });
  }
  agentId = z.object({ task: ownedAgentSchema }).parse(
    await runtime.rpc('agents.upsert', {
      projectId: 'one',
      title: 'Reviewer',
      prompt: 'Review.',
      schedule: { type: 'manual' },
      enabled: false,
      modelSelection: { instanceId: 'codex', model: 'test' },
      runtimeMode: 'approval-required',
      interactionMode: 'default',
      workspaceStrategy: { type: 'root' },
    }),
  ).task.id;
  vi.mocked(runtimeRpc).mockImplementation((method, payload) => runtime.rpc(method, payload));
});
afterEach(async () => {
  await runtime.close();
  await rm(directory, { recursive: true, force: true });
});
it('saves factory and agent appearance in the repository and keeps other repositories independent', async () => {
  await writeAppearance(agentId, { kind: 'emoji', value: '🧪' });
  await Promise.all([
    writeFactoryProfile('one', {
      title: 'Studio',
      icon: { kind: 'icon', name: 'rocket', color: 'blue' },
    }),
    writeFactoryProfile('two', { title: 'Research', icon: { kind: 'emoji', value: '🔎' } }),
  ]);
  expect(await readFactoryProfiles(['one', 'two', 'missing'])).toEqual({
    one: { title: 'Studio', icon: { kind: 'icon', name: 'rocket', color: 'blue' } },
    two: { title: 'Research', icon: { kind: 'emoji', value: '🔎' } },
  });
  expect(await readAppearances([agentId, 'missing'])).toEqual({
    [agentId]: { kind: 'emoji', value: '🧪' },
  });
  expect(await readFile(join(directory, 'one/factory/factory.yaml'), 'utf8')).toContain(
    'name: Studio',
  );
  await runtime.close();
  runtime = new AgentRuntime(join(directory, 'runtime'));
  expect(await readAppearances([agentId])).toEqual({ [agentId]: { kind: 'emoji', value: '🧪' } });
});
it('saves and deletes scorers in their owning repository', async () => {
  const scorer = {
    id: '69182512-b9ba-4e6d-929b-2faf98363377',
    name: 'Smoke test',
    project: join(directory, 'one'),
    agentId,
    rule: { type: 'contains', text: 'OK' },
    createdAt: '2026-10-28T10:00:00.000Z',
  };
  await writeScorer(scorer);
  expect(await readScorers()).toEqual([scorer]);
  expect(await readFile(join(directory, 'one/factory/factory.yaml'), 'utf8')).toContain(
    'Smoke test',
  );
  expect(await readFile(join(directory, 'two/factory/factory.yaml'), 'utf8')).not.toContain(
    'Smoke test',
  );
  await removeScorer(scorer.id);
  expect(await readScorers()).toEqual([]);
});
it('rejects invalid profiles and unknown repository owners without changing files', async () => {
  const before = await readFile(join(directory, 'one/factory/factory.yaml'), 'utf8');
  await expect(
    writeFactoryProfile('one', { title: ' ', icon: { kind: 'icon', name: 'factory' } }),
  ).rejects.toThrow();
  await expect(writeAppearance('missing-agent', { kind: 'emoji', value: '🧪' })).rejects.toThrow(
    'existing repository',
  );
  expect(await readFile(join(directory, 'one/factory/factory.yaml'), 'utf8')).toBe(before);
});
