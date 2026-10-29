import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { startHost } from '../src/host.mjs';
import { openClientCache } from '../src/ui/client-cache.js';
import { syncPullInputSchema } from '../src/sync-contracts.mjs';
import { watchHostChanges } from '../src/sync-transport.mjs';

const cleanup = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});

async function host({ provider = false } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'openfactory-sync-'));
  cleanup.push(() => rmSync(dataDir, { recursive: true, force: true }));
  const executable = join(dataDir, 'codex-fixture');
  if (provider) {
    writeFileSync(
      executable,
      `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('fixture'); process.exit(0); }
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Synchronized provider result'}}));
  console.log(JSON.stringify({type:'turn.completed'}));
});`,
      { mode: 0o700 },
    );
  }
  const options = { dataDir, port: 0, codexExecutable: provider ? executable : '/missing-codex' };
  const instance = await startHost(options);
  cleanup.push(() => instance.close());
  return { ...instance, dataDir, options };
}
async function call(instance, path, method = 'GET', data, token = instance.token) {
  const response = await fetch(`${instance.origin}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, data: await response.json() };
}
const createFactory = (instance, name) =>
  call(instance, '/v1/factories', 'POST', { name, directory: instance.dataDir });
const cacheName = () => `test${randomUUID().replaceAll('-', '')}`;
async function client(name = cacheName()) {
  const cache = await openClientCache({ name });
  cleanup.push(() => cache.close());
  return cache;
}
function replicate(cache, instance, errors = []) {
  cache.replicate(
    instance.id,
    async (checkpoint, limit) => {
      const result = await call(
        instance,
        `/v1/sync?after=${checkpoint?.sequence ?? 0}&limit=${limit}`,
      );
      if (result.status !== 200) {
        throw new Error(result.data.error);
      }
      return result.data;
    },
    (error) => errors.push(error),
  );
}
async function live(cache, instance, statuses = [], token = instance.token) {
  const controller = new AbortController();
  const watcher = watchHostChanges(
    { origin: instance.origin, token },
    {
      signal: controller.signal,
      onChange: () => cache.resync(instance.id),
      onStatus: (status) => statuses.push(status),
    },
  );
  cleanup.push(async () => {
    controller.abort();
    await watcher;
  });
  await expect.poll(() => statuses.some((status) => status.status === 'connected')).toBe(true);
  return { controller, watcher };
}

describe('SQLite host and free RxDB/Dexie replication', () => {
  it('keeps a persisted browser copy after reopening and catches up only the changed records', async () => {
    const instance = await host();
    const name = cacheName();
    const first = await client(name);
    const errors = [];
    await createFactory(instance, 'Saved factory');
    const pulledAfter = [];
    const initialSync = first.replicate(
      instance.id,
      async (checkpoint, limit) => {
        syncPullInputSchema.parse({ checkpoint, batchSize: limit });
        pulledAfter.push(checkpoint?.sequence ?? 0);
        return (await call(instance, `/v1/sync?after=${checkpoint?.sequence ?? 0}&limit=${limit}`))
          .data;
      },
      (error) => errors.push(error),
    );
    await expect
      .poll(async () => (await first.snapshot(instance.id))?.factories[0]?.name)
      .toBe('Saved factory');
    await initialSync.awaitInSync();
    await first.close();
    cleanup.pop();
    await instance.close();
    const reopened = await client(name);
    expect((await reopened.snapshot(instance.id)).factories[0].name).toBe('Saved factory');
    const restarted = await startHost(instance.options);
    cleanup.push(() => restarted.close());
    await call(restarted, '/v1/agents', 'POST', {
      name: 'Created while client was disconnected',
      factoryId: (await reopened.snapshot(instance.id)).factories[0].id,
      prompt: 'Review',
    });
    reopened.replicate(
      restarted.id,
      async (checkpoint, limit) => {
        syncPullInputSchema.parse({ checkpoint, batchSize: limit });
        pulledAfter.push(checkpoint?.sequence ?? 0);
        return (await call(restarted, `/v1/sync?after=${checkpoint?.sequence ?? 0}&limit=${limit}`))
          .data;
      },
      (error) => errors.push(error),
    );
    await expect
      .poll(async () => (await reopened.snapshot(instance.id))?.agents[0]?.name)
      .toBe('Created while client was disconnected');
    expect(pulledAfter.at(-1)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it('streams host changes, isolates hosts, and replicates deletions without exposing grants', async () => {
    const firstHost = await host();
    const secondHost = await host();
    const cache = await client();
    const errors = [];
    replicate(cache, firstHost, errors);
    replicate(cache, secondHost, errors);
    await live(cache, firstHost);
    await live(cache, secondHost);
    await createFactory(firstHost, 'Only on first');
    await createFactory(secondHost, 'Only on second');
    await expect
      .poll(async () => (await cache.snapshot(firstHost.id))?.factories[0]?.name)
      .toBe('Only on first');
    await expect
      .poll(async () => (await cache.snapshot(secondHost.id))?.factories[0]?.name)
      .toBe('Only on second');
    const pairing = await call(firstHost, '/v1/pairing', 'POST', {});
    const grant = (
      await call(
        firstHost,
        '/v1/pair',
        'POST',
        { code: pairing.data.code, name: 'Paired device' },
        '',
      )
    ).data;
    await expect.poll(async () => (await cache.snapshot(firstHost.id))?.peers.length).toBe(1);
    const exported = JSON.stringify((await call(firstHost, '/v1/sync')).data);
    expect(exported).not.toContain(grant.token);
    expect(exported).not.toContain('digest');
    const statuses = [];
    const watcher = await live(cache, firstHost, statuses, grant.token);
    await call(firstHost, `/v1/peers/${grant.peerId}`, 'DELETE');
    await expect.poll(async () => (await cache.snapshot(firstHost.id))?.peers.length).toBe(0);
    await expect.poll(() => statuses.some((status) => status.status === 'revoked')).toBe(true);
    await watcher.watcher;
    expect((await call(firstHost, '/v1/sync', 'GET', undefined, grant.token)).status).toBe(401);
    expect(errors).toEqual([]);
    const tombstone = (await call(firstHost, '/v1/sync')).data.documents.find(
      (record) => record._deleted,
    );
    expect(tombstone).toMatchObject({ kind: 'peer', data: '', _deleted: true });
    await cache.forget(firstHost.id);
    expect(await cache.snapshot(firstHost.id)).toBe(null);
    expect((await cache.snapshot(secondHost.id)).factories[0].name).toBe('Only on second');
  });

  it('reconnects a live client after host restart without losing its visible data', async () => {
    const instance = await host();
    const cache = await client();
    replicate(cache, instance);
    const statuses = [];
    await live(cache, instance, statuses);
    await createFactory(instance, 'Before restart');
    await expect.poll(async () => (await cache.snapshot(instance.id))?.factories.length).toBe(1);
    await instance.close();
    await expect.poll(() => statuses.some((status) => status.status === 'offline')).toBe(true);
    expect((await cache.snapshot(instance.id)).factories[0].name).toBe('Before restart');
    const restarted = await startHost({
      ...instance.options,
      port: Number(new URL(instance.origin).port),
    });
    cleanup.push(() => restarted.close());
    await call(restarted, '/v1/agents', 'POST', {
      factoryId: (await cache.snapshot(instance.id)).factories[0].id,
      name: 'After restart',
      prompt: 'Review',
    });
    await expect
      .poll(async () => (await cache.snapshot(instance.id))?.agents[0]?.name, { timeout: 8000 })
      .toBe('After restart');
  });

  it('replicates a real provider run and keeps its response after both sides restart', async () => {
    const instance = await host({ provider: true });
    const name = cacheName();
    const cache = await client(name);
    replicate(cache, instance);
    const watcher = await live(cache, instance);
    const factory = (await createFactory(instance, 'Run factory')).data;
    const agent = (
      await call(instance, '/v1/agents', 'POST', {
        factoryId: factory.id,
        name: 'Reviewer',
        prompt: 'Review this folder',
      })
    ).data;
    await call(instance, `/v1/agents/${agent.id}/run`, 'POST', {});
    await expect
      .poll(async () => (await cache.snapshot(instance.id))?.runs[0]?.status)
      .toBe('succeeded');
    expect((await cache.snapshot(instance.id)).runs[0].output).toBe(
      'Synchronized provider result\n',
    );
    watcher.controller.abort();
    await watcher.watcher;
    await instance.close();
    await cache.close();
    const reopened = await client(name);
    expect((await reopened.snapshot(instance.id)).runs[0]).toMatchObject({
      status: 'succeeded',
      output: 'Synchronized provider result\n',
    });
    const restarted = await startHost(instance.options);
    cleanup.push(() => restarted.close());
    expect((await call(restarted, '/v1/state')).data.runs[0].output).toBe(
      'Synchronized provider result\n',
    );
  });

  it('migrates the legacy host once, preserving identity and marking unfinished work interrupted', async () => {
    const instance = await host();
    const factory = (await createFactory(instance, 'Migrated')).data;
    await instance.close();
    const database = new DatabaseSync(join(instance.dataDir, 'host.sqlite'));
    const metadata = JSON.parse(database.prepare('SELECT data FROM host_metadata').get().data);
    database.close();
    rmSync(join(instance.dataDir, 'host.sqlite'));
    const agentId = randomUUID();
    const legacy = {
      ...metadata,
      factories: [factory],
      agents: [],
      peers: [],
      runs: [
        {
          id: randomUUID(),
          agentId,
          factoryId: factory.id,
          agentName: 'Legacy agent',
          directory: instance.dataDir,
          prompt: 'Review',
          sandbox: 'read-only',
          status: 'running',
          output: 'Saved output',
          error: null,
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          finishedAt: null,
        },
      ],
    };
    const original = JSON.stringify(legacy);
    writeFileSync(join(instance.dataDir, 'host.json'), original);
    const migrated = await startHost(instance.options);
    cleanup.push(() => migrated.close());
    const snapshot = (await call(migrated, '/v1/state')).data;
    expect(snapshot.host.id).toBe(instance.id);
    expect(snapshot.runs[0]).toMatchObject({ status: 'interrupted', output: 'Saved output' });
    expect(snapshot.factories[0]).toEqual(factory);
    expect(readFileSync(join(instance.dataDir, 'host.json'), 'utf8')).toBe(original);
    await migrated.close();
    writeFileSync(join(instance.dataDir, 'host.json'), 'invalid old backup');
    const restarted = await startHost(instance.options);
    cleanup.push(() => restarted.close());
    expect((await call(restarted, '/v1/state')).data.runs[0].output).toBe('Saved output');
  });

  it('recovers a failed pull and reports healthy again without requiring a new connection', async () => {
    const instance = await host();
    const cache = await client();
    const errors = [];
    let available = false;
    let healthy = false;
    cache.replicate(
      instance.id,
      async (checkpoint, limit) => {
        if (!available) {
          throw new Error('Temporary host failure');
        }
        return (await call(instance, `/v1/sync?after=${checkpoint?.sequence ?? 0}&limit=${limit}`))
          .data;
      },
      (error) => errors.push(error),
      () => {
        healthy = true;
      },
    );
    await expect.poll(() => errors.length).toBeGreaterThan(0);
    available = true;
    await expect.poll(() => healthy, { timeout: 5000 }).toBe(true);
    await expect.poll(async () => (await cache.snapshot(instance.id))?.host.id).toBe(instance.id);
  });

  it('paginates checkpoints and rejects invalid and unauthenticated requests', async () => {
    const instance = await host();
    await createFactory(instance, 'Paged');
    const first = (await call(instance, '/v1/sync?limit=1')).data;
    expect(first.documents).toHaveLength(1);
    const next = (await call(instance, `/v1/sync?after=${first.checkpoint.sequence}&limit=1`)).data;
    expect(next.documents).toHaveLength(1);
    expect(next.checkpoint.sequence).toBeGreaterThan(first.checkpoint.sequence);
    expect(next.documents[0].id).not.toBe(first.documents[0].id);
    expect((await call(instance, '/v1/sync?after=-1')).status).toBe(400);
    expect((await call(instance, '/v1/sync?limit=10000')).status).toBe(400);
    expect((await call(instance, '/v1/sync', 'GET', undefined, '')).status).toBe(401);
    expect((await call(instance, '/v1/events', 'GET', undefined, '')).status).toBe(401);
    const cache = await client();
    const errors = [];
    cache.replicate(
      randomUUID(),
      async () => first,
      (error) => errors.push(error),
    );
    await expect.poll(() => errors.length).toBeGreaterThan(0);
    expect(await cache.snapshot(instance.id)).toBe(null);
  });
});
