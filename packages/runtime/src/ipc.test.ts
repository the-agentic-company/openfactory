import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vite-plus/test';
import { runtimeRpc } from './client';
import { serveRuntime } from './server';

it('serves runtime RPC over the local platform transport', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory-ipc-'));
  const previous = process.env.OPENFACTORY_RUNTIME_DIR;
  process.env.OPENFACTORY_RUNTIME_DIR = directory;
  const server = await serveRuntime(directory);
  try {
    expect(await runtimeRpc('runtime.status', {})).toMatchObject({ owner: 'openfactory' });
  } finally {
    await server.close();
    if (previous === undefined) {
      delete process.env.OPENFACTORY_RUNTIME_DIR;
    } else {
      process.env.OPENFACTORY_RUNTIME_DIR = previous;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
