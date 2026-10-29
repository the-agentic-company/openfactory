import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { defaultDataDir } from '../src/host.mjs';
import { startWorkspaceServices } from '../src/workspace-services.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, '../web/package.json'));
const { WebSocket } = require('ws');
const dataDir = defaultDataDir();
const target = JSON.parse(readFileSync(join(dataDir, 'connection.json'), 'utf8'));
const owner = readFileSync(join(dataDir, 'owner-token'), 'utf8').trim();
process.env.OPENFACTORY_DESKTOP_DEV_PORT ??= '48182';
const workspace = await startWorkspaceServices({
  root: join(root, 'src'),
  dataDir,
  target: { ...target, token: owner },
  development: true,
});
const stylesheet = join(root, '../web/src/connection-settings.css');
const marker = '\n:root { --openfactory-hmr-verification: 1; }\n';
let socket;
try {
  assert.equal((await fetch(`${workspace.origin}/@vite/client`)).status, 200);
  const entry = await (
    await fetch(`${workspace.origin}/@id/virtual:tanstack-start-dev-client-entry`)
  ).text();
  assert.ok(entry.includes('import'), 'The application must serve its development entry.');
  const client = await (await fetch(`${workspace.origin}/@vite/client`)).text();
  const token = client.match(/const wsToken = "([^"]+)"/)?.[1];
  assert.ok(token, 'Vite must provide its websocket token.');
  socket = new WebSocket(`${workspace.origin.replace('http:', 'ws:')}/?token=${token}`, 'vite-hmr');
  await once(socket, 'open');
  await fetch(`${workspace.origin}/src/connection-settings.css`);
  const changed = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('No HMR update after the stylesheet changed.')),
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
  assert.equal(await changed, 'update', 'A stylesheet edit must update without reloading the app.');
  assert.equal(readFileSync(join(dataDir, 'owner-token'), 'utf8').trim(), owner);
  const state = await (
    await fetch(`${target.origin}/v1/state`, { headers: { authorization: `Bearer ${owner}` } })
  ).json();
  assert.equal(state.host.id, target.hostId);
  console.log(
    'Verified Vite HMR update, unchanged saved credential, and the same authenticated background host.',
  );
} finally {
  const current = readFileSync(stylesheet, 'utf8');
  writeFileSync(stylesheet, current.replace(marker, ''));
  socket?.close();
  workspace.close();
}
