import { request } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';

export function runtimeDirectory() {
  return process.env.OPENFACTORY_RUNTIME_DIR ?? join(homedir(), '.config/openfactory/runtime');
}
export function runtimeSocketPath(directory = runtimeDirectory(), platform = process.platform) {
  return platform === 'win32'
    ? `\\\\.\\pipe\\openfactory-${createHash('sha256').update(resolve(directory)).digest('hex')}`
    : join(directory, 'runtime.sock');
}
export function runtimeRpc(method: string, payload: unknown): Promise<unknown> {
  const body = JSON.stringify({ method, payload });
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: runtimeSocketPath(),
        path: '/rpc',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        let source = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          source += chunk;
        });
        res.on('end', () => {
          try {
            const result = z
              .object({ value: z.unknown().optional(), error: z.string().optional() })
              .parse(JSON.parse(source));
            if (result.error || res.statusCode !== 200) {
              reject(new Error(result.error ?? 'OpenFactory runtime rejected the request.'));
            } else {
              resolve(result.value);
            }
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(15000, () =>
      req.destroy(new Error('OpenFactory runtime did not respond within 15 seconds.')),
    );
    req.on('error', (error) =>
      reject(
        new Error(
          `OpenFactory runtime is unavailable. Start it with pnpm runtime:start. ${error.message}`,
        ),
      ),
    );
    req.end(body);
  });
}
