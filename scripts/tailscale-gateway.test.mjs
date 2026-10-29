import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createGateway } from './tailscale-gateway.mjs';

test('Tailscale setup preserves settings and refuses unrelated services', async () => {
  await promisify(execFile)('python3', [
    fileURLToPath(new URL('./configure_tailscale_test.py', import.meta.url)),
  ]);
});

async function listen(server, t) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

test('HTTP on the shared port redirects to HTTPS, preserving path and query', async (t) => {
  const port = await listen(createGateway({ origin: 'https://computer.test.ts.net:8018' }), t);
  const response = await new Promise((resolve, reject) => {
    http
      .get(
        { host: '127.0.0.1', port, path: '/app?view=runs', headers: { Host: '100.1.2.3:8018' } },
        resolve,
      )
      .on('error', reject);
  });
  response.resume();
  assert.equal(response.statusCode, 308);
  assert.equal(response.headers.location, 'https://computer.test.ts.net:8018/app?view=runs');
});

test('TLS bytes and subsequent traffic pass through unchanged on the same port', async (t) => {
  const upstreamPort = await listen(
    net.createServer((socket) => socket.pipe(socket)),
    t,
  );
  const gateway = createGateway({
    origin: 'https://computer.test.ts.net:8018',
    tlsPort: upstreamPort,
  });
  // Resolve the test tailnet name locally without relying on tailnet membership.
  const originalConnect = net.connect;
  t.mock.method(net, 'connect', (options) => originalConnect({ ...options, host: '127.0.0.1' }));
  const port = await listen(gateway, t);
  const client = originalConnect({ host: '127.0.0.1', port });
  t.after(() => client.destroy());
  await once(client, 'connect');
  for (const payload of [
    Buffer.from([0x16, 0x03, 0x01, 0x00, 0x03]),
    Buffer.from('more TLS data'),
  ]) {
    client.write(payload);
    const [echo] = await once(client, 'data');
    assert.deepEqual(echo, payload);
  }
  client.end();
});
