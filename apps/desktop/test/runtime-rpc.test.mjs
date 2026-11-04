import { afterEach, beforeAll, expect, it } from 'vite-plus/test';
import { build } from 'vite-plus';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
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
});

it('excludes host-only migrations from the remote RPC group', async () => {
  const { connection } = await connectedHost();
  await expect(
    runtimeRpc('migration.import', { projects: [], agents: [] }, connection),
  ).rejects.toThrow();
  await expect(runtimeRpc('definitions.migrate', {}, connection)).rejects.toThrow();
  expect(await runtimeRpc('runtime.status', {}, connection)).toMatchObject({ agents: 0 });
});
