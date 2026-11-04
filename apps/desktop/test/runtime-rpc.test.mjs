import { afterEach, beforeAll, expect, it } from 'vite-plus/test';
import { build } from 'vite-plus';
import { mkdtemp, mkdir, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startHost } from '../src/host.mjs';
import { serveRuntime } from '../../../packages/runtime/src/server.ts';
import { runtimeRpc } from '../../../packages/runtime/src/client.ts';

beforeAll(async () => {
  await build({
    root: resolve('../../packages/runtime'),
    configFile: resolve('../../packages/runtime/vite.config.ts'),
    build: { outDir: resolve('runtime') },
  });
});
const cleanup = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});

async function connectedHost() {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory-effect-rpc-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const previous = process.env.OPENFACTORY_RUNTIME_DIR;
  process.env.OPENFACTORY_RUNTIME_DIR = join(directory, 'runtime');
  cleanup.push(() => {
    if (previous === undefined) {
      delete process.env.OPENFACTORY_RUNTIME_DIR;
    } else {
      process.env.OPENFACTORY_RUNTIME_DIR = previous;
    }
  });
  const runtime = await serveRuntime(process.env.OPENFACTORY_RUNTIME_DIR);
  cleanup.push(() => runtime.close());
  const host = await startHost({ dataDir: join(directory, 'host'), port: 0 });
  cleanup.push(() => host.close());
  return { directory, connection: { origin: host.origin, token: host.token } };
}

it('carries Effect RPC through the authenticated desktop host and preserves domain errors', async () => {
  const { directory, connection } = await connectedHost();
  expect(await runtimeRpc('runtime.status', {}, connection)).toMatchObject({
    owner: 'openfactory',
  });
  const workspaceRoot = join(directory, 'repository');
  await mkdir(workspaceRoot);
  await runtimeRpc(
    'projects.upsert',
    { id: 'project', title: 'Repository', workspaceRoot },
    connection,
  );
  expect(await runtimeRpc('workspace.snapshot', {}, connection)).toMatchObject({
    snapshot: { projects: [{ id: 'project', title: 'Repository' }] },
  });
  expect(await runtimeRpc('definitions.get', { projectId: 'project' }, connection)).toMatchObject({
    files: { 'factory.yaml': expect.stringContaining('Repository') },
  });
  await expect(
    runtimeRpc('definitions.get', { projectId: 'missing' }, connection),
  ).rejects.toMatchObject({
    _tag: 'RuntimeError',
    message: expect.stringContaining('factory'),
  });
  expect(
    (
      await fetch(`${connection.origin}/v1/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(401);
  await expect(
    runtimeRpc('runtime.status', {}, { ...connection, token: 'revoked' }),
  ).rejects.toThrow();
  await expect(
    runtimeRpc('runtime.status', {}, { ...connection, token: 'revoked'.repeat(8) }),
  ).rejects.toThrow('HTTP 401');
});

it('excludes host-only migrations from the remote RPC group', async () => {
  const { connection } = await connectedHost();
  await expect(
    runtimeRpc('migration.import', { projects: [], agents: [] }, connection),
  ).rejects.toThrow();
  await expect(runtimeRpc('definitions.migrate', {}, connection)).rejects.toThrow();
  expect(await runtimeRpc('runtime.status', {}, connection)).toMatchObject({ agents: 0 });
});

it('pairs the portable mobile client and shares agent, team, definition, history and usage workflows', async () => {
  const {
    createRuntimeClient,
    pairComputer,
    agentUpdateFromDefinition,
    createTeamFiles,
    readFactoryRuns,
  } = await import('../../../packages/client/src/index.ts');
  const { agentDefinition } = await import('../../../packages/core/src/index.ts');
  const { directory, connection } = await connectedHost();
  const response = await fetch(`${connection.origin}/v1/pairing`, {
    method: 'POST',
    headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  const pairing = await response.json();
  const computer = await pairComputer({
    origin: connection.origin,
    code: pairing.code,
    name: 'Native mobile test',
  });
  const client = createRuntimeClient(computer);
  const workspaceRoot = join(directory, 'mobile-repository');
  await mkdir(workspaceRoot);
  await client.call('projects.upsert', {
    id: 'mobile-project',
    title: 'Mobile factory',
    workspaceRoot,
  });
  await client.call('factory.machine', {
    projectId: 'mobile-project',
    enabled: true,
    expectedRevision: 'initial',
  });
  const { task } = await client.call('agents.upsert', {
    title: 'Mobile reviewer',
    prompt: 'Review changes.',
    projectId: 'mobile-project',
    schedule: { type: 'manual' },
    enabled: false,
    modelSelection: { instanceId: 'codex', model: 'test' },
    runtimeMode: 'approval-required',
    interactionMode: 'default',
    workspaceStrategy: { type: 'root' },
  });
  const source = agentDefinition(task);
  const updated = await client.call(
    'agents.upsert',
    agentUpdateFromDefinition(task, source.replace('Review changes.', 'Inspect the diff.'), source),
  );
  expect(updated.task.prompt).toBe('Inspect the diff.');
  await expect(
    client.call('agents.upsert', agentUpdateFromDefinition(task, source, source)),
  ).rejects.toThrow('changed');
  const current = await client.call('definitions.get', { projectId: 'mobile-project' });
  const team = createTeamFiles(current, {
    name: 'Review',
    slug: 'review',
    description: 'Review the repository',
    instructions: 'Be precise.',
    leadAgentId: task.id,
    memberAgentIds: [task.id],
  });
  await client.call('definitions.save', {
    projectId: 'mobile-project',
    revision: current.revision,
    files: team.files,
  });
  expect(
    (await client.call('teams.list', { projectId: 'mobile-project' })).teams[0].definition.name,
  ).toBe('Review');
  expect(await readFactoryRuns('mobile-project', client.call)).toMatchObject({
    runs: [],
    unavailable: 0,
  });
  const today = new Date().toISOString().slice(0, 10);
  expect(
    await client.call('usage.factory', {
      project: 'mobile-project',
      sinceDay: today,
      untilDay: today,
      timeZone: 'UTC',
    }),
  ).toMatchObject({ buckets: [], sources: [{ status: 'ok' }] });
  expect(
    await client.call('pullRequests.list', { project: 'mobile-project', days: 7 }),
  ).toMatchObject({ pulls: [], unlinked: ['Mobile factory'] });
  const previousProvider = process.env.OPENFACTORY_CODEX_BIN;
  cleanup.push(() => {
    if (previousProvider === undefined) {
      delete process.env.OPENFACTORY_CODEX_BIN;
    } else {
      process.env.OPENFACTORY_CODEX_BIN = previousProvider;
    }
  });
  const provider = join(directory, 'mobile-provider');
  await writeFile(
    provider,
    `#!/usr/bin/env node
let text = ''; for await (const chunk of process.stdin) text += chunk;
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\\n');
emit({ type: 'thread.started', thread_id: 'portable-test' });
emit({ type: 'item.completed', item: { id: 'answer', type: 'agent_message', text } });
emit({ type: 'turn.completed', usage: { input_tokens: 20, cached_input_tokens: 5, output_tokens: 12 } });
`,
  );
  await chmod(provider, 0o700);
  process.env.OPENFACTORY_CODEX_BIN = provider;
  const receipt = await client.call('agents.run', { id: task.id, requestId: 'mobile-run' });
  expect(await client.call('agents.run', { id: task.id, requestId: 'mobile-run' })).toMatchObject(
    receipt,
  );
  await expect
    .poll(
      async () =>
        (await client.call('sessions.projection', { threadId: receipt.threadId })).runs[0]?.status,
    )
    .toBe('completed');
  const followup = {
    threadId: receipt.threadId,
    agentId: task.id,
    messageId: 'mobile-followup',
    text: 'Continue the review.',
  };
  const reply = await client.call('sessions.send', followup);
  expect(await client.call('sessions.send', followup)).toMatchObject(reply);
  await expect
    .poll(
      async () =>
        (await client.call('sessions.projection', { threadId: receipt.threadId })).runs.find(
          (run) => run.id === reply.runId,
        )?.status,
    )
    .toBe('completed');
  const { readRunDetail } = await import('../../../packages/client/src/index.ts');
  expect(
    await readRunDetail({ threadId: receipt.threadId, runId: receipt.runId }, client.call),
  ).toMatchObject({ agentId: task.id, run: { status: 'completed' } });
  expect(
    await client.call('usage.agent', {
      id: task.id,
      sinceDay: today,
      untilDay: today,
      timeZone: 'UTC',
    }),
  ).toMatchObject({ runs: 2, measuredTurns: 2, partial: false });
  const { readFactoryOverview } = await import('../../../packages/client/src/index.ts');
  const overview = await readFactoryOverview(
    {
      project: 'mobile-project',
      sinceDay: today,
      untilDay: today,
      timeZone: 'UTC',
      days: 7,
    },
    client.call,
  );
  expect(overview).toMatchObject({ historyLoaded: true, limited: false, issues: [] });
  expect(overview.runs.map((run) => run.id).sort()).toEqual([receipt.runId, reply.runId].sort());
  expect(overview.runs.every((run) => run.status === 'completed' && !('messages' in run))).toBe(
    true,
  );
  expect(
    overview.usage.buckets.reduce(
      (totals, bucket) => ({
        uncachedInputTokens: totals.uncachedInputTokens + bucket.totals.uncachedInputTokens,
        cachedInputTokens: totals.cachedInputTokens + bucket.totals.cachedInputTokens,
        cacheCreationTokens: totals.cacheCreationTokens + bucket.totals.cacheCreationTokens,
        outputTokens: totals.outputTokens + bucket.totals.outputTokens,
      }),
      { uncachedInputTokens: 0, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 0 },
    ),
  ).toEqual({
    uncachedInputTokens: 15,
    cachedInputTokens: 5,
    cacheCreationTokens: 0,
    outputTokens: 12,
  });
  expect(overview.pulls.pulls).toEqual([]);
  await expect(
    pairComputer({ origin: connection.origin, code: pairing.code, name: 'Replay' }),
  ).rejects.toThrow();
});
