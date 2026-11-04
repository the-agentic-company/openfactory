import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fork, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ensureWorkspaceRuntime } from '../src/workspace-services.mjs';
import { defaultDataDir } from '../src/host.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (
  !existsSync(join(root, 'runtime/runtime.mjs')) ||
  !existsSync(join(root, 'runtime/client.mjs'))
) {
  const pnpm = process.env.npm_execpath;
  if (!pnpm) {
    throw new Error('Start desktop development with pnpm dev:desktop.');
  }
  const args = [
    '--filter',
    '@openfactory/runtime',
    'exec',
    'vp',
    'build',
    '--outDir',
    join(root, 'runtime'),
  ];
  const javascriptCli = /\.[cm]?js$/.test(pnpm);
  const built = spawnSync(
    javascriptCli ? process.execPath : pnpm,
    javascriptCli ? [pnpm, ...args] : args,
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
  if (built.status !== 0) {
    process.exit(built.status ?? 1);
  }
}
await ensureWorkspaceRuntime({ root: join(root, 'src'), dataDir: defaultDataDir() });
const port = Number(process.env.OPENFACTORY_DESKTOP_DEV_PORT ?? 8018);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('OPENFACTORY_DESKTOP_DEV_PORT must be a port between 1 and 65535.');
}
process.env.OPENFACTORY_DESKTOP_DEV = '1';
process.env.VITE_DEV_SERVER_URL = `http://127.0.0.1:${port}`;
process.env.OPENFACTORY_DESKTOP_SESSION = randomUUID();
const directory = mkdtempSync(join(tmpdir(), 'openfactory-desktop-dev-'));
process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
const env = {
  ...process.env,
  PORT: String(port),
  OPENFACTORY_DESKTOP_CONNECTION_FILE: join(directory, 'connection.json'),
};
delete env.OPENFACTORY_RUNTIME_ORIGIN;
delete env.OPENFACTORY_RUNTIME_TOKEN;
const web = fork(join(root, 'src/workspace-server.mjs'), [], {
  env,
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
});
let desktop;
let stopping = false;
function shutdown(code) {
  if (stopping) {
    return;
  }
  stopping = true;
  process.exitCode = code;
  desktop?.kill();
  web.kill();
  const timer = setTimeout(() => {
    desktop?.kill('SIGKILL');
    web.kill('SIGKILL');
  }, 3000);
  timer.unref();
}
process.once('SIGINT', () => shutdown(130));
process.once('SIGTERM', () => shutdown(143));
web.once('error', (error) => {
  console.error(error.message);
  shutdown(1);
});
web.once('exit', (code) => {
  if (!stopping) {
    console.error(
      desktop
        ? 'The web development server stopped.'
        : `Could not start the web server on port ${port}. Stop the existing app development server before starting pnpm dev or pnpm dev:desktop.`,
    );
    shutdown(code || 1);
  }
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The web development server did not start.')),
      60000,
    );
    const ready = (message) => {
      if (message.type === 'ready') {
        clearTimeout(timer);
        web.removeListener('message', ready);
        resolve();
      }
    };
    web.on('message', ready);
    web.once('exit', () => {
      clearTimeout(timer);
      reject(
        new Error(
          `Could not start the web server on port ${port}. Stop the existing app development server before starting pnpm dev or pnpm dev:desktop.`,
        ),
      );
    });
    web.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  if (!stopping) {
    ({ child: desktop } = await import('./launch.mjs'));
    desktop.on('message', (message) => {
      if (message.type === 'connection' && web.connected) {
        web.send(message);
      }
    });
    web.on('message', (message) => {
      if (message.type === 'selected' && desktop.connected) {
        desktop.send(message);
      }
    });
    desktop.once('exit', (code) => shutdown(code ?? 1));
    desktop.once('error', () => shutdown(1));
  }
} catch (error) {
  if (!stopping) {
    console.error(error.message);
    shutdown(1);
  }
}
