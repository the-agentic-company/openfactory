import { request } from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const runtimeDirectory = () =>
  process.env.OPENFACTORY_RUNTIME_DIR ?? join(homedir(), '.config/openfactory/runtime');

export function runtimeSocketPath(directory = runtimeDirectory(), platform = process.platform) {
  return platform === 'win32'
    ? `\\\\.\\pipe\\openfactory-${createHash('sha256').update(resolve(directory)).digest('hex')}`
    : join(directory, 'runtime.sock');
}

export function runtimeRequest(method, payload) {
  const content = JSON.stringify({ method, payload });
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: runtimeSocketPath(),
        path: '/rpc',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(content),
        },
      },
      (response) => {
        let source = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          source += chunk;
        });
        response.on('end', () => {
          try {
            const result = JSON.parse(source);
            if (response.statusCode !== 200 || result.error) {
              reject(new Error(result.error ?? 'The runtime rejected this request.'));
            } else {
              resolve(result.value);
            }
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error('The OpenFactory runtime did not respond.')));
    req.on('error', () =>
      reject(
        new Error('The OpenFactory runtime is stopped. Restart OpenFactory on this computer.'),
      ),
    );
    req.end(content);
  });
}
