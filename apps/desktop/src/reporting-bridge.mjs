import { createServer } from 'node:http';
import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { reportingSocketPath } from './reporting-socket.mjs';
import { z } from 'zod';

const querySchema = z.discriminatedUnion('method', [
  z.object({ computerId: z.string(), method: z.literal('identity'), payload: z.object({}) }),
  z.object({
    computerId: z.string(),
    method: z.enum(['runtime.status', 'agents.list', 'workspace.snapshot']),
    payload: z.object({}),
  }),
  z.object({
    computerId: z.string(),
    method: z.literal('sessions.read'),
    payload: z.object({ threadId: z.string() }),
  }),
]);

export async function startReportingBridge({ directory, identity, call }) {
  const socket = reportingSocketPath(directory);
  if (existsSync(socket)) {
    unlinkSync(socket);
  }
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/read') {
        response.writeHead(404).end();
        return;
      }
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 16000) {
          response.writeHead(413).end();
          return;
        }
      }
      const query = querySchema.parse(JSON.parse(body));
      const result =
        query.method === 'identity'
          ? await identity(query.computerId)
          : await call(query.computerId, query.method, query.payload);
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(400, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Reporting read failed.',
        }),
      );
    }
  });
  server.requestTimeout = 20000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, resolve);
  });
  if (process.platform !== 'win32') {
    chmodSync(socket, 0o600);
  }
  return {
    close: () => {
      server.close();
      if (existsSync(socket)) {
        unlinkSync(socket);
      }
    },
  };
}
