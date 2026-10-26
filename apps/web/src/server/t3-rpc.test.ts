import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { WebSocketServer } from 'ws';
import { t3Rpc } from './t3-rpc';

const previousOrigin = process.env.T3_ORIGIN;
const previousToken = process.env.T3_TOKEN;
let server: WebSocketServer;
beforeEach(async () => {
  server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP address');
  }
  process.env.T3_ORIGIN = `http://127.0.0.1:${address.port}`;
  process.env.T3_TOKEN = 'test-credential';
});
afterEach(async () => {
  for (const client of server.clients) {
    client.terminate();
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (previousOrigin === undefined) {
    delete process.env.T3_ORIGIN;
  } else {
    process.env.T3_ORIGIN = previousOrigin;
  }
  if (previousToken === undefined) {
    delete process.env.T3_TOKEN;
  } else {
    process.env.T3_TOKEN = previousToken;
  }
});

describe('T3 authenticated RPC boundary', () => {
  it('authenticates, uses protocol v2, and waits for its own reply after a ping', async () => {
    server.on('connection', (socket, request) => {
      expect(request.headers.authorization).toBe('Bearer test-credential');
      expect(request.url).toBe('/ws?orchestrationProtocol=2');
      socket.on('message', (raw) => {
        const frame = JSON.parse(Buffer.from(raw as ArrayBuffer).toString());
        if (frame._tag !== 'Request') {
          return;
        }
        expect(frame.tag).toBe('scheduledTasks.setEnabled');
        expect(frame.payload).toEqual({ id: 'task-1', enabled: false });
        socket.send(JSON.stringify({ _tag: 'Ping' }));
        socket.send(
          JSON.stringify({
            _tag: 'Exit',
            requestId: 'other',
            exit: { _tag: 'Success', value: 'wrong' },
          }),
        );
        socket.send(
          JSON.stringify({
            _tag: 'Exit',
            requestId: frame.id,
            exit: { _tag: 'Success', value: { task: { enabled: false } } },
          }),
        );
      });
    });
    await expect(
      t3Rpc('scheduledTasks.setEnabled', { id: 'task-1', enabled: false }),
    ).resolves.toEqual({ task: { enabled: false } });
  });
  it('reads a full thread snapshot from the subscription stream', async () => {
    const snapshot = { kind: 'snapshot', projection: { runs: [{ id: 'older-run' }] } };
    server.on('connection', (socket) =>
      socket.on('message', (raw) => {
        const frame = JSON.parse(Buffer.from(raw as ArrayBuffer).toString());
        if (frame._tag !== 'Request') {
          return;
        }
        expect(frame.tag).toBe('orchestration.subscribeThread');
        expect(frame.payload).toEqual({ threadId: 'thread-1', acceptBoundedSnapshot: false });
        socket.send(JSON.stringify({ _tag: 'Chunk', requestId: frame.id, values: [snapshot] }));
      }),
    );
    await expect(
      t3Rpc('orchestration.subscribeThread', {
        threadId: 'thread-1',
        acceptBoundedSnapshot: false,
      }),
    ).resolves.toEqual(snapshot);
  });
  it('rejects a server failure without exposing its private error payload', async () => {
    server.on('connection', (socket) =>
      socket.on('message', () =>
        socket.send(
          JSON.stringify({
            _tag: 'Exit',
            requestId: '1',
            exit: { _tag: 'Failure', cause: 'private upstream details' },
          }),
        ),
      ),
    );
    await expect(t3Rpc('scheduledTasks.list', {})).rejects.toThrow(
      'T3 Code rejected the operation',
    );
  });
  it('rejects an unexpected disconnect instead of leaving the UI waiting', async () => {
    server.on('connection', (socket) => socket.close());
    await expect(t3Rpc('scheduledTasks.list', {})).rejects.toThrow('closed the connection');
  });
  it('rejects malformed protocol responses', async () => {
    server.on('connection', (socket) => socket.on('message', () => socket.send('invalid json')));
    await expect(t3Rpc('scheduledTasks.list', {})).rejects.toThrow('Unexpected response');
  });
});
