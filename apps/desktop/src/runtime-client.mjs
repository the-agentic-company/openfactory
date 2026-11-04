import { request } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const runtimeDirectory = () =>
  process.env.OPENFACTORY_RUNTIME_DIR ?? join(homedir(), '.config/openfactory/runtime');

const runtimeClient = () => import('../runtime/client.mjs');

export async function runtimeRequest(method, payload) {
  const { runtimeRpc } = await runtimeClient();
  return runtimeRpc(method, payload);
}

// Forward Effect RPC bytes to the restricted local endpoint without interpreting frames.
export async function proxyRuntimeRpc(incoming, outgoing) {
  const { runtimeSocketPath } = await runtimeClient();
  const upstream = request({
    socketPath: runtimeSocketPath(),
    path: '/remote-rpc',
    method: 'POST',
    headers: { 'content-type': incoming.headers['content-type'] ?? 'application/json' },
  });
  upstream.on('response', (response) => {
    outgoing.writeHead(response.statusCode ?? 502, {
      'content-type': response.headers['content-type'] ?? 'application/json',
    });
    response.on('error', () => outgoing.destroy());
    response.pipe(outgoing);
  });
  upstream.on('error', () => {
    if (outgoing.headersSent) {
      outgoing.destroy();
    } else {
      outgoing.writeHead(502).end();
    }
  });
  upstream.setTimeout(60000, () => upstream.destroy(new Error('Runtime request timed out.')));
  incoming.on('aborted', () => upstream.destroy());
  incoming.on('error', () => upstream.destroy());
  outgoing.on('close', () => upstream.destroy());
  let bytes = 0;
  incoming.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > 100_000_000) {
      upstream.destroy();
      incoming.unpipe(upstream);
      if (!outgoing.headersSent) {
        outgoing.writeHead(413).end();
      } else {
        outgoing.destroy();
      }
    }
  });
  incoming.pipe(upstream);
}
