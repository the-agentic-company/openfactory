import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { beforeEach, afterEach, expect, it } from 'vite-plus/test';
import { agentDefinition, agentDirectory, parseAgentDefinition } from '@openfactory/core';
import { AgentRuntime } from './runtime';
import { ownedAgentSchema } from './contracts';
import { readDefinition } from './definition-store';
import { migrateDefinitions } from './migrate-definitions';

let directory: string;
let runtime: AgentRuntime;
let repository: string;
let settings: string;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'openfactory-factory-migration-'));
  repository = join(directory, 'repository');
  settings = join(directory, 'settings');
  await mkdir(repository);
  runtime = new AgentRuntime(join(directory, 'runtime'));
  runtime.store.put('projects', 'project', {
    id: 'project',
    title: 'Factory',
    workspaceRoot: repository,
  });
});
afterEach(async () => {
  await runtime.close();
  await rm(directory, { recursive: true, force: true });
});
function oldAgent() {
  const agent = ownedAgentSchema.parse({
    id: 'existing-agent',
    title: 'Operator',
    prompt: 'Live prompt',
    enabled: true,
    projectId: 'project',
    threadId: 'existing-thread',
    schedule: { type: 'interval', everyMs: 3600000 },
    modelSelection: { instanceId: 'codex', model: 'test', options: { reasoningEffort: 'high' } },
    runtimeMode: 'full-access',
    interactionMode: 'plan',
    workspaceStrategy: { type: 'root', branch: 'main' },
    nextRunAt: '2099-01-01T10:00:00.000Z',
    lastRunAt: null,
    lastRunStatus: 'never',
    lastRunError: null,
    runCount: 12,
  });
  runtime.store.put('agents', agent.id, agent);
  runtime.store.put('secrets', agent.id, {
    token: 'preserve-token',
    signatureSecret: 'preserve-secret',
  });
  return agent;
}
async function legacySnapshot() {
  const agent = oldAgent();
  const path = `agents/${agentDirectory(agent)}/agent.md`;
  const root = join(settings, 'definitions', hash('project'));
  const revision = randomUUID();
  const snapshot = join(root, revision);
  await mkdir(join(snapshot, path, '..'), { recursive: true });
  const files = {
    'factory.yaml':
      'schemaVersion: v1alpha1\nname: Factory\nrepositories: []\nagentDefaults: { model: auto }\n',
    [path]: agentDefinition(agent)
      .replace(/^id:.*\n/m, '')
      .replace('Live prompt', 'Saved prompt'),
  };
  for (const [name, source] of Object.entries(files)) {
    await writeFile(join(snapshot, name), source);
  }
  await writeFile(
    join(snapshot, 'manifest.json'),
    JSON.stringify({ paths: Object.keys(files), bindings: { [path]: agent.id } }),
  );
  await writeFile(join(root, 'current'), revision);
  return { root, path, agent };
}
it('moves saved edits and global metadata into the repository, preserves identity and state, and reruns safely', async () => {
  const { root, path, agent } = await legacySnapshot();
  await mkdir(join(settings, 'factories'), { recursive: true });
  await writeFile(
    join(settings, 'factories', `${hash('project')}.json`),
    JSON.stringify({ title: 'Studio', icon: 'rocket' }),
  );
  await mkdir(join(settings, 'appearances'));
  await writeFile(
    join(settings, 'appearances', `${hash(agent.id)}.json`),
    JSON.stringify({ kind: 'emoji', value: '🧪' }),
  );
  const before = runtime.getAgent(agent.id);
  expect(await migrateDefinitions(runtime.store, { settingsDirectory: settings })).toMatchObject({
    applied: false,
    factories: [{ location: join(repository, 'factory'), status: 'migrate' }],
  });
  expect(readDefinition(repository)).toBeNull();
  expect(runtime.getAgent(agent.id)).toEqual(before);
  await migrateDefinitions(runtime.store, { settingsDirectory: settings, apply: true });
  const definition = readDefinition(repository);
  expect(definition?.bindings[path]).toBe(agent.id);
  expect(parseAgentDefinition(definition?.files[path] ?? '')).toMatchObject({
    id: agent.id,
    prompt: 'Saved prompt',
    harness: { options: { reasoningEffort: 'high' } },
    workspaceStrategy: { type: 'root', branch: 'main' },
    interactionMode: 'plan',
  });
  expect(runtime.getAgent(agent.id)).toMatchObject({
    prompt: 'Saved prompt',
    enabled: true,
    nextRunAt: agent.nextRunAt,
    threadId: agent.threadId,
    runCount: 12,
  });
  expect(runtime.store.get('secrets', agent.id, z.unknown())).toEqual({
    token: 'preserve-token',
    signatureSecret: 'preserve-secret',
  });
  await expect(access(root)).rejects.toThrow();
  expect(await readFile(join(repository, 'factory/factory.yaml'), 'utf8')).toContain(
    'name: Studio',
  );
  expect(
    await runtime.rpc('factory.settings', {
      operation: 'read',
      section: 'appearances',
      ids: [agent.id],
    }),
  ).toEqual({ [agent.id]: { kind: 'emoji', value: '🧪' } });
  expect(
    await migrateDefinitions(runtime.store, { settingsDirectory: settings, apply: true }),
  ).toMatchObject({ factories: [{ status: 'already-migrated' }] });
  expect(readDefinition(repository)?.revision).toBe(definition?.revision);
});
it('exports a runtime-only factory and refuses to use global definitions during normal operation', async () => {
  oldAgent();
  await expect(runtime.rpc('agents.list', {})).rejects.toThrow('factory/factory.yaml is missing');
  await migrateDefinitions(runtime.store, { settingsDirectory: settings, apply: true });
  expect(await runtime.rpc('agents.list', {})).toMatchObject({ tasks: [{ id: 'existing-agent' }] });
  await rm(join(repository, 'factory'), { recursive: true });
  await expect(runtime.rpc('agents.list', {})).rejects.toThrow('factory/factory.yaml is missing');
});
it('preflights destination conflicts without overwriting either definition', async () => {
  const { root } = await legacySnapshot();
  await mkdir(join(repository, 'factory'));
  await writeFile(
    join(repository, 'factory/factory.yaml'),
    'schemaVersion: v1alpha1\nname: Keep me\nrepositories: []\nagentDefaults: { model: auto }\n',
  );
  await expect(
    migrateDefinitions(runtime.store, { settingsDirectory: settings, apply: true }),
  ).rejects.toThrow('different files');
  expect(await readFile(join(repository, 'factory/factory.yaml'), 'utf8')).toContain('Keep me');
  await expect(access(join(root, 'current'))).resolves.toBeUndefined();
});

it('moves a scorer for an unregistered repository into that repository without enabling agents', async () => {
  const other = join(directory, 'other-repository');
  await mkdir(other);
  await mkdir(join(settings, 'scorers'), { recursive: true });
  const scorer = {
    id: randomUUID(),
    name: 'Existing scorer',
    project: other,
    agentId: null,
    rule: { type: 'contains', text: 'OK' },
    createdAt: new Date().toISOString(),
  };
  await writeFile(join(settings, 'scorers', `${scorer.id}.json`), JSON.stringify(scorer));
  await migrateDefinitions(runtime.store, { settingsDirectory: settings, apply: true });
  expect(readDefinition(other)?.files['factory.yaml']).toContain('Existing scorer');
  expect(await runtime.rpc('factory.settings', { operation: 'read', section: 'scorers' })).toEqual([
    scorer,
  ]);
  expect(await runtime.rpc('agents.list', {})).toEqual({ tasks: [] });
});

it('rejects a repository edit made after migration planning instead of overwriting it', async () => {
  oldAgent();
  const second = join(directory, 'second');
  await mkdir(second);
  runtime.store.put('projects', 'second', { id: 'second', title: 'Second', workspaceRoot: second });
  const migrating = migrateDefinitions(runtime.store, { settingsDirectory: settings, apply: true });
  mkdirSync(join(second, 'factory'));
  const source =
    'schemaVersion: v1alpha1\nname: Edited during migration\nrepositories: []\nagentDefaults: { model: auto }\n';
  writeFileSync(join(second, 'factory/factory.yaml'), source);
  await expect(migrating).rejects.toThrow('another editor');
  expect(await readFile(join(second, 'factory/factory.yaml'), 'utf8')).toBe(source);
});

it('keeps scorers reached through a repository alias in the same factory', async () => {
  const { agent } = await legacySnapshot();
  const alias = join(directory, 'repository-alias');
  await symlink(repository, alias, 'dir');
  await mkdir(join(settings, 'scorers'), { recursive: true });
  const scorer = {
    id: randomUUID(),
    name: 'Alias scorer',
    project: alias,
    agentId: agent.id,
    rule: { type: 'contains', text: 'OK' },
    createdAt: new Date().toISOString(),
  };
  await writeFile(join(settings, 'scorers', `${scorer.id}.json`), JSON.stringify(scorer));
  const result = await migrateDefinitions(runtime.store, {
    settingsDirectory: settings,
    apply: true,
  });
  expect(result.factories).toHaveLength(1);
  expect(await runtime.rpc('factory.settings', { operation: 'read', section: 'scorers' })).toEqual([
    { ...scorer, project: repository },
  ]);
  expect(await runtime.rpc('agents.list', {})).toMatchObject({ tasks: [{ id: agent.id }] });
});
