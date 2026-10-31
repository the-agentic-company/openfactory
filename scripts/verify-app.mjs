import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';

// Accept the desktop payload too, so the same check covers what Electron ships.
const output = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]) + sep)
  : new URL('../apps/app/.output/', import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(new URL('server/index.mjs', output))], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0', NITRO_PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(child, 'exit');
let log = '';
try {
  const origin = await new Promise((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error(`App did not start: ${log}`)), 15000);
    const collect = (chunk) => {
      log += chunk;
      const address = log.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (address) {
        clearTimeout(timeout);
        accept(address);
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error(log));
    });
  });
  const home = await fetch(`${origin}/`, { redirect: 'manual' });
  assert.ok([301, 302, 303, 307, 308].includes(home.status), 'Root redirects to the workspace');
  assert.equal(home.headers.get('location'), '/app');
  const workspace = await fetch(`${origin}/app`);
  assert.equal(workspace.status, 200);
  const html = await workspace.text();
  assert.match(html, /Overview/);
  assert.match(html, /class="[^"]*workspace-sidebar|class="sidebar/);
  const siteOrigin = process.env.VITE_OPENFACTORY_SITE_URL ?? 'https://open-factory.app';
  assert.ok(
    html.includes(new URL('/docs', siteOrigin).href),
    'Documentation opens the public site',
  );
  assert.ok(
    html.includes(new URL('/marketplace', siteOrigin).href),
    'Marketplace opens the public site',
  );
  process.stdout.write('200 /app (workspace, external documentation and marketplace links)\n');
  for (const path of [
    '/docs',
    '/docs/quickstart',
    '/marketplace',
    '/marketplace/agent',
    '/download',
    '/install.sh',
    '/downloads/installer.deb',
  ]) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    assert.equal(response.status, 404, `${path}: public routes are absent from the app`);
    await response.text();
    process.stdout.write(`404 ${path}\n`);
  }
  const legacy = await fetch(`${origin}/app/marketplace/agent`, { redirect: 'manual' });
  assert.ok([301, 302, 303, 307, 308].includes(legacy.status));
  assert.equal(legacy.headers.get('location'), new URL('/marketplace/agent', siteOrigin).href);
  let checked = 0;
  for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:[cm]?js|css)$/.test(entry.name)) {
      continue;
    }
    const path = `${entry.parentPath}/${entry.name}`;
    assert.doesNotMatch(
      await readFile(path, 'utf8'),
      /Your agents, on your computers|\.landing-hero|\.catalog-main|\.openfactory-docs|fumadocs-ui|fumadocs-core/,
      `${path}: no landing page, marketplace UI, or documentation code`,
    );
    checked++;
  }
  assert.ok(checked > 0, 'App contains built assets to inspect');
  process.stdout.write(`Verified ${checked} app files contain no public-site code.\n`);
} finally {
  child.kill('SIGTERM');
  await exited;
}
