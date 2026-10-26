import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

// Only the server can import this module. Credentials never enter browser responses.
export async function t3Rpc(method: string, payload: unknown): Promise<unknown> {
  const token =
    process.env.T3_TOKEN ??
    (
      await readFile(
        process.env.T3_TOKEN_FILE ?? join(homedir(), '.config/openfactory/t3-token'),
        'utf8',
      ).catch(() => {
        throw new Error('Connect T3 Code: configure T3_TOKEN_FILE on the server.');
      })
    ).trim();
  const origin = process.env.T3_ORIGIN ?? 'http://127.0.0.1:3773';
  const url = new URL('/ws?orchestrationProtocol=2', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
    const timer = setTimeout(
      () => finish(new Error('T3 Code did not respond within 15 seconds.')),
      15_000,
    );
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };
    socket.on('open', () =>
      socket.send(JSON.stringify({ _tag: 'Request', id: '1', tag: method, payload, headers: [] })),
    );
    socket.on('error', () =>
      finish(new Error('Cannot connect to T3 Code. Check the server and connection settings.')),
    );
    socket.on('close', () => finish(new Error('T3 Code closed the connection before responding.')));
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(
          (Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw as ArrayBuffer)).toString(
            'utf8',
          ),
        );
        if (message._tag === 'Ping') {
          socket.send(JSON.stringify({ _tag: 'Pong' }));
          return;
        }
        if (
          (method === 'orchestration.subscribeShell' ||
            method === 'orchestration.subscribeThread') &&
          message._tag === 'Chunk' &&
          message.requestId === '1'
        ) {
          socket.send(JSON.stringify({ _tag: 'Interrupt', requestId: '1' }));
          finish(undefined, message.values[0]);
          return;
        }
        if (message._tag !== 'Exit' || message.requestId !== '1') {
          return;
        }
        if (message.exit._tag === 'Success') {
          finish(undefined, message.exit.value);
        } else {
          finish(
            new Error('T3 Code rejected the operation. Check permissions and agent configuration.'),
          );
        }
      } catch {
        finish(new Error('Unexpected response from T3 Code.'));
      }
    });
  });
}
