import { spawn, fork } from 'node:child_process';
import { createServer } from 'node:net';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeDirectory, runtimeRequest } from './runtime-client.mjs';

export async function ensureWorkspaceRuntime({ root, dataDir }) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  try {
    await runtimeRequest('runtime.status', {});
  } catch {
    const log = openSync(join(dataDir, 'runtime.log'), 'a', 0o600);
    const child = spawn(process.execPath, [join(root, '../runtime/runtime.mjs'), 'serve'], {
      detached: true,
      stdio: ['ignore', log, log],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        OPENFACTORY_RUNTIME_DIR: runtimeDirectory(),
      },
    });
    child.unref();
    closeSync(log);
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise((accept) => setTimeout(accept, 200));
      try {
        await runtimeRequest('runtime.status', {});
        ready = true;
        break;
      } catch {
        /* Wait for the owned runtime socket. */
      }
    }
    if (!ready) {
      throw new Error(
        `The OpenFactory runtime could not start. See ${join(dataDir, 'runtime.log')}.`,
      );
    }
  }
}

export async function startWorkspaceServices({ root, dataDir, target, development = false }) {
  await ensureWorkspaceRuntime({ root, dataDir });
  const port = await new Promise((accept, reject) => {
    const listener = createServer();
    listener.once('error', reject);
    listener.listen(
      development ? Number(process.env.OPENFACTORY_DESKTOP_DEV_PORT ?? 48181) : 0,
      '127.0.0.1',
      () => {
        const address = listener.address();
        if (!address || typeof address === 'string') {
          listener.close();
          reject(new Error('Could not allocate a workspace port.'));
          return;
        }
        const selectedPort = address.port;
        listener.close(() => accept(selectedPort));
      },
    );
  });
  const settingsDir = (hostId) => join(dataDir, 'workspace-settings', hostId);
  const log = openSync(join(dataDir, 'workspace.log'), 'a', 0o600);
  const child = fork(join(root, 'workspace-server.mjs'), [], {
    execPath: process.execPath,
    execArgv: [],
    stdio: ['ignore', log, log, 'ipc'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OPENFACTORY_DESKTOP_DEV: development ? '1' : '0',
      HOST: '127.0.0.1',
      PORT: String(port),
      OPENFACTORY_RUNTIME_ORIGIN: target.origin,
      OPENFACTORY_RUNTIME_TOKEN: target.token,
      OPENFACTORY_SETTINGS_DIR: settingsDir(target.hostId),
    },
  });
  closeSync(log);
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < (development ? 400 : 80); attempt++) {
    if (child.exitCode !== null) {
      break;
    }
    await new Promise((accept) => setTimeout(accept, 150));
    try {
      const response = await fetch(`${origin}/favicon.ico`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the shared web server. */
    }
  }
  if (!ready) {
    child.kill();
    throw new Error(`The workspace could not start. See ${join(dataDir, 'workspace.log')}.`);
  }
  return {
    origin,
    select: (connection) =>
      new Promise((accept, reject) => {
        const timer = setTimeout(() => {
          child.removeListener('message', selected);
          reject(new Error('Could not switch the workspace connection.'));
        }, 5000);
        const selected = (message) => {
          if (message.type === 'selected') {
            clearTimeout(timer);
            child.removeListener('message', selected);
            accept();
          }
        };
        child.on('message', selected);
        child.send({
          type: 'connection',
          origin: connection.origin,
          token: connection.token,
          settingsDir: settingsDir(connection.hostId),
        });
      }),
    close: () => child.kill(),
  };
}
