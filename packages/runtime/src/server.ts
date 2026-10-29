import { createServer } from 'node:http';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { AgentRuntime } from './runtime';
import { runtimeSocketPath } from './client';

export async function serveRuntime(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const lockPath = join(directory, 'runtime.lock');
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new Error(`Invalid runtime lock: ${lockPath}`);
    }
    try {
      process.kill(pid, 0);
      throw new Error(`OpenFactory runtime is already running (PID ${pid}).`);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
        throw error;
      }
      unlinkSync(lockPath);
    }
  }
  const lock = openSync(lockPath, 'wx', 0o600);
  writeFileSync(lock, String(process.pid));
  closeSync(lock);
  const socketPath = runtimeSocketPath(directory);
  if (existsSync(socketPath)) {
    unlinkSync(socketPath);
  }
  const runtime = new AgentRuntime(directory);
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method !== 'POST' || req.url !== '/rpc') {
      res.writeHead(404).end('{}');
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const raw of req) {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        bytes += chunk.length;
        if (bytes > 100_000_000) {
          throw new Error('Runtime request exceeds 100 MB.');
        }
        chunks.push(chunk);
      }
      const { method, payload } = z
        .object({ method: z.string(), payload: z.unknown() })
        .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const value = await runtime.rpc(method, payload);
      res.end(JSON.stringify({ value }));
    } catch (error) {
      res.writeHead(400).end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Runtime request failed.',
        }),
      );
    }
  });
  server.requestTimeout = 30000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      if (process.platform !== 'win32') {
        chmodSync(socketPath, 0o600);
      }
      resolve();
    });
  });
  runtime.start();
  let closing = false;
  const close = async () => {
    if (closing) {
      return;
    }
    closing = true;
    server.close();
    await runtime.close();
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }
    unlinkSync(lockPath);
  };
  return { close };
}
