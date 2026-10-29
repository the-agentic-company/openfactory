import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { WebSocketServer } from 'ws';
import { expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { serveRuntime } from '../../../../packages/runtime/src/server';
import { Store } from '../../../../packages/runtime/src/store';
import { ownedAgentSchema } from '../../../../packages/runtime/src/contracts';
import { threadHistorySchema } from '@openfactory/core';

const exec = promisify(execFile);
it('drains T3, refreshes completed history and due times, and preserves local pause decisions on retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory-cutover-'));
  const server = await serveRuntime(directory);
  const t3 = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((done) => t3.once('listening', done));
  const address = t3.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP port.');
  }
  const due = new Date(Date.now() + 3600000).toISOString();
  const later = new Date(Date.now() + 7200000).toISOString();
  const agent = {
    id: 'migrated-agent',
    title: 'Agent',
    prompt: 'Retain these instructions',
    enabled: true,
    schedule: { type: 'interval', everyMs: 3600000 },
    projectId: 'project',
    threadId: 'old-thread',
    modelSelection: {
      instanceId: 'codex',
      model: 'test',
      options: [{ id: 'reasoningEffort', value: 'medium' }],
    },
    workspaceStrategy: { type: 'root' },
    runtimeMode: 'approval-required',
    interactionMode: 'default',
    nextRunAt: due,
    lastRunAt: new Date(Date.now() - 3600000).toISOString(),
    lastRunStatus: 'never',
    lastRunError: null,
    runCount: 0,
  };
  let state = 'before-dry-run';
  const projection = () => ({
    thread: { id: 'old-thread', title: 'Agent', projectId: 'project' },
    runs: [
      {
        id: 'last-turn',
        ordinal: 1,
        userMessageId: 'request',
        status: state === 'drained' ? 'completed' : 'running',
        requestedAt: due,
        startedAt: due,
        completedAt: state === 'drained' ? due : null,
      },
    ],
    messages: [
      {
        id: 'answer',
        runId: 'last-turn',
        scheduledTaskId: agent.id,
        role: 'assistant',
        text: state === 'drained' ? 'Final retained answer' : 'Incomplete',
        createdAt: due,
      },
    ],
  });
  t3.on('connection', (socket) =>
    socket.on('message', (raw) => {
      const { tag, payload } = z
        .object({
          tag: z.string(),
          payload: z.object({ enabled: z.boolean().optional() }).passthrough(),
        })
        .parse(
          JSON.parse(
            (Array.isArray(raw)
              ? Buffer.concat(raw)
              : Buffer.isBuffer(raw)
                ? raw
                : Buffer.from(raw)
            ).toString('utf8'),
          ),
        );
      let value: unknown;
      if (tag === 'scheduledTasks.list') {
        value = { tasks: [agent] };
      } else if (tag === 'orchestration.subscribeShell') {
        value = {
          snapshot: {
            projects: [{ id: 'project', title: 'Factory', workspaceRoot: directory }],
            threads: [{ id: 'old-thread', title: 'Agent', projectId: 'project' }],
          },
        };
      } else if (tag === 'scheduledTasks.setEnabled') {
        expect(payload.enabled).toBe(false);
        state = 'drained';
        agent.lastRunAt = later;
        agent.nextRunAt = '';
        value = { task: { ...agent, nextRunAt: null, enabled: false } };
      } else {
        value = { projection: projection() };
      }
      const streaming = tag.startsWith('orchestration.subscribe');
      socket.send(
        JSON.stringify(
          streaming
            ? { _tag: 'Chunk', requestId: '1', values: [value] }
            : { _tag: 'Exit', requestId: '1', exit: { _tag: 'Success', value } },
        ),
      );
    }),
  );
  const environment = {
    ...process.env,
    OPENFACTORY_RUNTIME_DIR: directory,
    T3_ORIGIN: `http://127.0.0.1:${address.port}`,
    T3_TOKEN: 'fixture-token',
  };
  const invoke = (...args: string[]) =>
    exec(process.execPath, ['apps/web/scripts/migrate-t3.mjs', ...args], {
      cwd: resolve(import.meta.dirname, '../../../..'),
      env: environment,
    });
  try {
    await invoke();
    // The old owner advances between the operator's dry run and actual cutover.
    agent.nextRunAt = later;
    state = 'before-pause';
    await invoke('--apply');
    const store = new Store(directory);
    try {
      const migrated = store.get('agents', agent.id, ownedAgentSchema);
      expect(migrated).toMatchObject({
        enabled: true,
        modelSelection: { options: { reasoningEffort: 'medium' } },
      });
      expect(migrated?.nextRunAt).toBe(new Date(new Date(later).getTime() + 3600000).toISOString());
      const archive = store.get('archives', 'old-thread', threadHistorySchema);
      expect(archive?.runs[0]?.status).toBe('completed');
      expect(archive?.messages[0]?.text).toBe('Final retained answer');
      store.put('agents', agent.id, { ...migrated, enabled: false, nextRunAt: null });
      await invoke('--apply');
      expect(store.get('agents', agent.id, ownedAgentSchema)?.enabled).toBe(false);
      const receipt = JSON.parse(
        await readFile(join(directory, 'migration-t3/cutover.json'), 'utf8'),
      );
      expect(receipt.finishedAt).toBeTruthy();
    } finally {
      store.close();
    }
  } finally {
    await server.close();
    await new Promise<void>((done, reject) =>
      t3.close((error) => (error ? reject(error) : done())),
    );
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
