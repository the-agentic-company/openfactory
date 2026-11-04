import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const session = 'openfactory-dev';
const socket = join(root, '.cache/dev/desktop.sock');
const port = Number(process.env.OPENFACTORY_DESKTOP_DEV_PORT ?? 8018);
const appUrl = `http://127.0.0.1:${port}/app`;
const siteUrl = 'http://127.0.0.1:8020/';
const mcpPort = Number(process.env.OPENFACTORY_MCP_PORT ?? 8022);
const mcpUrl = `http://127.0.0.1:${mcpPort}`;
const pnpm = process.env.npm_execpath;
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const environment = Object.entries(process.env)
  .filter(([key]) => !['TMUX', 'TMUX_PANE'].includes(key))
  .flatMap(([key, value]) => ['-e', `${key}=${value}`]);

function tmux(args: string[], required = true) {
  const result = spawnSync('tmux', args, { encoding: 'utf8' });
  if (result.error) {
    throw new Error('Install tmux before running pnpm dev.', { cause: result.error });
  }
  if (required && result.status !== 0) {
    throw new Error(result.stderr.trim() || `tmux ${args[0]} failed.`);
  }
  return result;
}

function command(args: string[]) {
  return [
    'exec',
    'env',
    `PATH=${dirname(process.execPath)}:${process.env.PATH}`,
    `npm_execpath=${pnpm}`,
    `OPENFACTORY_DEV_SOCKET=${socket}`,
    `OPENFACTORY_DESKTOP_DEV_PORT=${port}`,
    ...args,
  ]
    .map(quote)
    .join(' ');
}

function ensureWindow(name: 'desktop' | 'site' | 'mcp', args: string[]) {
  const target = `${session}:${name}`;
  const pane = tmux([
    'list-panes',
    '-s',
    '-t',
    session,
    '-F',
    '#{window_name}\t#{pane_dead}\t#{pane_current_command}',
  ])
    .stdout.split('\n')
    .map((line) => line.split('\t'))
    .find(([window]) => window === name);
  if (pane && pane[1] === '0' && !['zsh', 'bash', 'sh', 'fish'].includes(pane[2])) {
    return;
  }
  const launch = command(args);
  if (pane) {
    tmux(['respawn-pane', '-k', '-t', target, '-c', root, ...environment, launch]);
  } else {
    tmux(['new-window', '-d', '-t', session, '-n', name, '-c', root, ...environment, launch]);
  }
}

async function waitFor<T>(label: string, probe: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 90_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await probe();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`${label} did not become ready. Inspect tmux attach -t ${session}.`, {
    cause: lastError,
  });
}

function openDesktop(): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: socket, path: '/open', method: 'POST' }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(body));
          return;
        }
        try {
          const value: unknown = JSON.parse(body);
          if (
            typeof value !== 'object' ||
            value === null ||
            !('pid' in value) ||
            typeof value.pid !== 'number' ||
            !Number.isInteger(value.pid) ||
            value.pid < 1
          ) {
            throw new Error('The desktop launcher did not return an Electron PID.');
          }
          const { pid } = value;
          process.kill(pid, 0);
          resolve(pid);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Desktop launcher timed out.')));
    req.end();
  });
}

async function ready(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  await response.body?.cancel();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }
}

try {
  if (Number(process.versions.node.split('.')[0]) < 26 || !pnpm) {
    throw new Error('Use Node 26 or newer and start development with pnpm dev.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('OPENFACTORY_DESKTOP_DEV_PORT must be a port between 1 and 65535.');
  }
  if (!Number.isInteger(mcpPort) || mcpPort < 1 || mcpPort > 65535) {
    throw new Error('OPENFACTORY_MCP_PORT must be a port between 1 and 65535.');
  }
  mkdirSync(dirname(socket), { recursive: true });
  if (tmux(['has-session', '-t', session], false).status !== 0) {
    rmSync(socket, { force: true });
    tmux([
      'new-session',
      '-d',
      '-s',
      session,
      '-n',
      'desktop',
      '-c',
      root,
      ...environment,
      command([process.execPath, join(root, 'apps/desktop/scripts/dev.mjs')]),
    ]);
    tmux(['set-option', '-t', session, '@openfactory-root', root]);
    tmux(['set-option', '-t', session, 'remain-on-exit', 'on']);
  } else if (
    tmux(['show-options', '-v', '-t', session, '@openfactory-root'], false).stdout.trim() !== root
  ) {
    throw new Error(
      `The ${session} tmux session belongs to another startup command. Stop it before running pnpm dev.`,
    );
  }
  ensureWindow('desktop', [process.execPath, join(root, 'apps/desktop/scripts/dev.mjs')]);
  const pnpmCommand = /\.[cm]?js$/.test(pnpm) ? [process.execPath, pnpm] : [pnpm];
  ensureWindow('site', [...pnpmCommand, 'exec', 'vp', 'run', '@openfactory/site#dev']);
  ensureWindow('mcp', [...pnpmCommand, 'exec', 'vp', 'run', '@openfactory/mcp#dev']);
  await waitFor('OpenFactory MCP', () => ready(`${mcpUrl}/health`));
  await waitFor('App server', () => ready(appUrl));
  await waitFor('Website', () => ready(siteUrl));
  const pid = await waitFor('Electron', openDesktop);
  console.log(
    `Electron is running (PID ${pid}).\nApp: ${appUrl}\nWebsite: ${siteUrl}\nMCP: ${mcpUrl}/mcp`,
  );
  console.log(`Logs: tmux attach -t ${session}\nStop: tmux kill-session -t ${session}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
