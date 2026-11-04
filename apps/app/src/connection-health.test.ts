import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vite-plus/test';
import { checkConnection } from './connection-health';

it('checks a responding host and records latency and freshness', async () => {
  const server = createServer((_request, response) => response.end('{}'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing test address');
    }
    const before = Date.now();
    const health = await checkConnection(() => fetch(`http://127.0.0.1:${address.port}`), false);
    expect(health.kind).toBe('reachable');
    expect(health.checkedAt).toBeGreaterThanOrEqual(before);
    if (health.kind === 'reachable') {
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('reports a real request timeout with remote recovery advice', async () => {
  const server = createServer(() => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing test address');
    }
    const health = await checkConnection(
      () =>
        fetch(`http://127.0.0.1:${address.port}`, {
          signal: AbortSignal.timeout(30),
        }),
      false,
    );
    expect(health.kind).toBe('timeout');
    if (health.kind !== 'reachable') {
      expect(health.recommendation).toContain('Tailscale');
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it.each([
  ['HTTP 401: Invalid token', 'access-denied', 'pair again'],
  ['Connection timed out after 8 seconds.', 'timeout', 'restart'],
  ['Computer unreachable: ECONNREFUSED', 'unreachable', 'restart'],
  ['Invalid host response', 'error', 'restart'],
])('explains %s', async (message, kind, advice) => {
  const health = await checkConnection(async () => {
    throw new Error(message);
  }, true);
  expect(health.kind).toBe(kind);
  if (health.kind !== 'reachable') {
    expect(health.detail).toBe(message);
    expect(health.recommendation).toContain(advice);
  }
});

it('keeps the underlying network failure in diagnostics', async () => {
  const health = await checkConnection(async () => {
    throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND host.ts.net') });
  }, false);
  expect(health.kind).toBe('unreachable');
  if (health.kind !== 'reachable') {
    expect(health.detail).toContain('ENOTFOUND');
  }
});
