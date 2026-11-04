import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createPortListener } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, '../app/package.json'));
const { WebSocket } = require('ws');
const directory = mkdtempSync(join(tmpdir(), 'openfactory-development-'));
const runtimes = [];
async function runtime(title) {
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, `Bearer fixture-token-${title}`);
    let body = '';
    for await (const chunk of request) {
      body += chunk;
    }
    const { method } = JSON.parse(body);
    const value =
      method === 'agents.list'
        ? { tasks: [] }
        : method === 'workspace.snapshot'
          ? { snapshot: { projects: [{ id: title, title, workspaceRoot: `/fixtures/${title}` }] } }
          : {};
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ value }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  runtimes.push(server);
  return { origin: `http://127.0.0.1:${server.address().port}`, token: `fixture-token-${title}` };
}
const browser = await runtime('Browser-fixture');
const desktopA = await runtime('Desktop-first');
const desktopB = await runtime('Desktop-second');
const preferences = join(directory, 'connections.json');
writeFileSync(
  preferences,
  JSON.stringify({
    activeId: 'browser',
    computers: [{ id: 'browser', name: 'Browser', ...browser }],
  }),
);
const listener = createPortListener();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const sessionId = randomUUID();
const web = fork(join(root, 'src/workspace-server.mjs'), [], {
  env: {
    ...process.env,
    PORT: String(port),
    OPENFACTORY_DESKTOP_DEV: '1',
    OPENFACTORY_DESKTOP_SESSION: sessionId,
    OPENFACTORY_DESKTOP_CONNECTION_FILE: join(directory, 'desktop.json'),
    OPENFACTORY_RUNTIME_ORIGIN: '',
    OPENFACTORY_RUNTIME_TOKEN: '',
    OPENFACTORY_CONNECTIONS_FILE: preferences,
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
const exited = once(web, 'exit');
let diagnostics = '';
web.stdout.on('data', (chunk) => {
  diagnostics += chunk;
});
web.stderr.on('data', (chunk) => {
  diagnostics += chunk;
});
const stylesheet = join(root, '../app/src/connection-settings.css');
const marker = `\n:root { --openfactory-hmr-${randomUUID()}: 1; }\n`;
let socket;
let changedStylesheet = false;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Server startup timed out: ${diagnostics}`)),
      60000,
    );
    web.on('message', (message) => {
      if (message.type === 'ready') {
        clearTimeout(timer);
        resolve();
      }
    });
    web.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(diagnostics));
    });
  });
  const headers = { cookie: `openfactory-desktop-${port}=${sessionId}` };
  async function select(connection) {
    const requestId = randomUUID();
    const selected = once(web, 'message');
    web.send({ type: 'connection', requestId, ...connection });
    assert.deepEqual((await selected)[0], { type: 'selected', requestId });
  }
  async function page(requestHeaders, expected, excluded) {
    const response = await fetch(`${origin}/app`, { headers: requestHeaders });
    assert.equal(response.status, 200, diagnostics);
    const html = await response.text();
    assert.ok(
      html.includes(expected),
      `Expected ${expected}: ${html.slice(-6000)}\n${diagnostics}`,
    );
    assert.ok(!html.includes(excluded), `Unexpected ${excluded} in the other client's page.`);
    assert.ok(!html.includes('fixture-token-'), 'Host credentials must not reach the page.');
    assert.ok(!html.includes(sessionId), 'The HTTP-only session must not reach page data.');
  }
  await select(desktopA);
  await Promise.all([
    page(headers, 'Desktop-first', 'Browser-fixture'),
    page({}, 'Browser-fixture', 'Desktop-first'),
    page(
      { cookie: `openfactory-desktop-${port}=wrong-session` },
      'Browser-fixture',
      'Desktop-first',
    ),
  ]);
  await select(desktopB);
  await Promise.all([
    page(headers, 'Desktop-second', 'Desktop-first'),
    page({}, 'Browser-fixture', 'Desktop-second'),
  ]);
  const seen = new Set();
  const pending = ['/src/routes/app_.projects.$project.$view.tsx?tsr-split=component'];
  while (pending.length) {
    const path = pending.shift();
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, `Module failed: ${path}\n${diagnostics}`);
    const body = await response.text();
    for (const match of body.matchAll(/(?:from\s*|import\s*)["'](\/[^"']+)["']/g)) {
      if (!seen.has(match[1]) && !match[1].includes('?url')) {
        pending.push(match[1]);
      }
    }
    assert.ok(seen.size < 1000, 'Unexpectedly large import graph.');
  }
  const client = await (await fetch(`${origin}/@vite/client`)).text();
  const token = client.match(/const wsToken = "([^"]+)"/)?.[1];
  assert.ok(token, 'Vite must provide its websocket token.');
  socket = new WebSocket(`${origin.replace('http:', 'ws:')}/?token=${token}`, 'vite-hmr');
  await once(socket, 'open');
  await fetch(`${origin}/src/connection-settings.css`);
  const changed = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('No HMR update after stylesheet change.')),
      15000,
    );
    socket.on('message', (message) => {
      const event = JSON.parse(message.toString());
      if (event.type === 'update' || event.type === 'full-reload') {
        clearTimeout(timer);
        resolve(event.type);
      }
    });
  });
  writeFileSync(stylesheet, readFileSync(stylesheet, 'utf8') + marker);
  changedStylesheet = true;
  assert.equal(await changed, 'update');
  console.log(
    `Verified browser/desktop connection isolation, computer switching, ${seen.size} factory module imports, and CSS HMR.`,
  );
} finally {
  if (changedStylesheet) {
    writeFileSync(stylesheet, readFileSync(stylesheet, 'utf8').replace(marker, ''));
  }
  socket?.terminate();
  web.kill();
  const timer = setTimeout(() => web.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(timer);
  await Promise.all(runtimes.map((server) => new Promise((resolve) => server.close(resolve))));
  rmSync(directory, { recursive: true, force: true });
  rmSync(join(root, `../app/node_modules/.vite/dev-${port}`), { recursive: true, force: true });
}
