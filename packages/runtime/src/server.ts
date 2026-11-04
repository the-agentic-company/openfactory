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
import { makeRuntimeHandler } from './rpc-server';
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
  const handler = await makeRuntimeHandler(runtime);
  const server = createServer((req, res) => {
    const path = req.url?.replace(/\/$/, '');
    if (req.method === 'POST' && path === '/rpc') {
      handler.local(req, res);
    } else if (req.method === 'POST' && path === '/remote-rpc') {
      handler.remote(req, res);
    } else {
      res.writeHead(404).end();
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
    await handler.close();
    await runtime.close();
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }
    unlinkSync(lockPath);
  };
  return { close };
}
