import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { agentSchema } from '@openfactory/core';
import { runtimeClientLayer, runtimeRpc } from './client';
import { Effect, Schema } from 'effect';
import { Rpc, RpcClient, RpcGroup } from 'effect/rpc';
import { RuntimeError } from './rpc-contracts';
import { savedDefinitionSchema } from './definition-store';
import { serveRuntime } from './server';

let directory: string;
let previous: string | undefined;
let server: Awaited<ReturnType<typeof serveRuntime>>;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'openfactory-ipc-'));
  previous = process.env.OPENFACTORY_RUNTIME_DIR;
  process.env.OPENFACTORY_RUNTIME_DIR = directory;
  server = await serveRuntime(directory);
});
afterEach(async () => {
  await server.close();
  if (previous === undefined) {
    delete process.env.OPENFACTORY_RUNTIME_DIR;
  } else {
    process.env.OPENFACTORY_RUNTIME_DIR = previous;
  }
  await rm(directory, { recursive: true, force: true });
});

it('serves Effect RPC over the local platform transport', async () => {
  expect(await runtimeRpc('runtime.status', {})).toMatchObject({ owner: 'openfactory' });
});

it('round trips repository definitions, agents, settings, and typed domain failures', async () => {
  const workspaceRoot = join(directory, 'repository');
  await mkdir(workspaceRoot);
  await runtimeRpc('projects.upsert', { id: 'project', title: 'Repository', workspaceRoot });
  const { task } = z.object({ task: agentSchema }).parse(
    await runtimeRpc('agents.upsert', {
      title: 'Review',
      prompt: 'Review changes.',
      projectId: 'project',
      schedule: { type: 'manual' },
      enabled: false,
      modelSelection: {
        instanceId: 'codex',
        model: 'test',
        options: [{ id: 'effort', value: 'high' }],
      },
      runtimeMode: 'approval-required',
      interactionMode: 'default',
      workspaceStrategy: { type: 'root' },
    }),
  );
  expect(task.modelSelection.options).toEqual({ effort: 'high' });
  expect(await runtimeRpc('agents.list', {})).toMatchObject({ tasks: [{ id: task.id }] });
  await runtimeRpc('factory.settings', {
    operation: 'write',
    section: 'appearances',
    id: task.id,
    value: { kind: 'emoji', value: '🐙' },
  });
  expect(
    await runtimeRpc('factory.settings', {
      operation: 'read',
      section: 'appearances',
      ids: [task.id],
    }),
  ).toEqual({ [task.id]: { kind: 'emoji', value: '🐙' } });
  const definition = savedDefinitionSchema.parse(
    await runtimeRpc('definitions.get', { projectId: 'project' }),
  );
  const files = {
    ...definition.files,
    'factory.yaml': definition.files['factory.yaml'].replace('Repository', 'Changed'),
  };
  expect(
    await runtimeRpc('definitions.save', {
      projectId: 'project',
      revision: definition.revision,
      files,
    }),
  ).toMatchObject({ files });
  await expect(
    runtimeRpc('definitions.save', { projectId: 'project', revision: definition.revision, files }),
  ).rejects.toMatchObject({ _tag: 'RuntimeError', message: expect.stringContaining('changed') });
  await expect(runtimeRpc('sessions.read', { threadId: 'missing' })).rejects.toMatchObject({
    _tag: 'RuntimeError',
    message: expect.stringContaining('archived'),
  });
});

it('keeps local migration available and preserves imported history', async () => {
  await runtimeRpc('migration.import', {
    projects: [],
    agents: [],
    histories: [
      {
        thread: { id: 'archive', title: 'Archived', projectId: 'old' },
        runs: [],
        messages: [],
      },
    ],
  });
  expect(await runtimeRpc('sessions.read', { threadId: 'archive' })).toMatchObject({
    projection: { thread: { id: 'archive', projectId: 'old' }, runs: [], messages: [] },
  });
});

it('validates requests from independently constructed Effect RPC clients before changing state', async () => {
  const foreign = RpcGroup.make(
    Rpc.make('projects.upsert', {
      payload: Schema.Unknown,
      success: Schema.Unknown,
      error: RuntimeError,
    }),
  );
  const invalid = Effect.gen(function* () {
    const client = yield* RpcClient.make(foreign);
    return yield* client['projects.upsert']({ id: 42 });
  }).pipe(Effect.provide(runtimeClientLayer()), Effect.scoped);
  await expect(Effect.runPromise(invalid)).rejects.toThrow();
  expect(await runtimeRpc('workspace.snapshot', {})).toMatchObject({ snapshot: { projects: [] } });
});
