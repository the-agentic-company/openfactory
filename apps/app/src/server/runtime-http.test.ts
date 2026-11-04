import { createServer } from 'node:http';
import { expect, it } from 'vite-plus/test';
import { createRuntimeClient } from '@openfactory/client';

it('reports the HTTP failure when host status works but the factory RPC endpoint rejects access', async () => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/state') {
      response.end('{}');
    } else {
      response.writeHead(403);
      response.end(
        JSON.stringify({ error: 'Manage pairing and network access on the host computer.' }),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing test address');
    }
    const origin = `http://127.0.0.1:${address.port}`;
    expect((await fetch(`${origin}/v1/state`)).status).toBe(200);
    const client = createRuntimeClient({ origin, token: 'test-token'.repeat(4) });
    await expect(client.call('agents.list', {})).rejects.toThrow('HTTP 403: Factory access failed');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('preserves the network cause when the factory connection fails', async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing test address');
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const client = createRuntimeClient({
    origin: `http://127.0.0.1:${address.port}`,
    token: 'test-token'.repeat(4),
  });
  await expect(client.call('agents.list', {})).rejects.toThrow(
    /Cannot reach OpenFactory:.*ECONNREFUSED/,
  );
});
