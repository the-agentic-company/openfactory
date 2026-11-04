import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { startReportingBridge } from './reporting-bridge.mjs';

test('private reporting bridge permits reads, rejects writes and restricts socket access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory-reporting-'));
  const calls = [];
  const bridge = await startReportingBridge({
    directory,
    identity: async (id) => ({ id }),
    call: async (id, method, payload) => {
      calls.push({ id, method, payload });
      return { ok: true };
    },
  });
  function read(body) {
    return new Promise((resolve, reject) => {
      const req = request(
        { socketPath: join(directory, 'reporting.sock'), path: '/read', method: 'POST' },
        (response) => {
          let text = '';
          response.on('data', (chunk) => {
            text += chunk;
          });
          response.on('end', () =>
            resolve({ status: response.statusCode, body: JSON.parse(text) }),
          );
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify(body));
    });
  }
  try {
    assert.equal((await stat(join(directory, 'reporting.sock'))).mode & 0o777, 0o600);
    assert.deepEqual(await read({ computerId: 'dell', method: 'identity', payload: {} }), {
      status: 200,
      body: { id: 'dell' },
    });
    assert.equal(
      (await read({ computerId: 'dell', method: 'sessions.read', payload: { threadId: 'thread' } }))
        .status,
      200,
    );
    assert.equal(
      (await read({ computerId: 'dell', method: 'agents.run', payload: { id: 'agent' } })).status,
      400,
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      id: 'dell',
      method: 'sessions.read',
      payload: { threadId: 'thread' },
    });
  } finally {
    bridge.close();
    await rm(directory, { recursive: true, force: true });
  }
});
