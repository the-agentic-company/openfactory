import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const { default: site } = await import('../.vercel/output/functions/__server.func/index.mjs');

for (const [path, title] of [
  ['/', 'Your agents, on your computers'],
  ['/download', 'Download OpenFactory'],
  ['/marketplace', 'Factory marketplace'],
  ['/marketplace/agent', 'Factory marketplace'],
  ['/marketplace/automation', 'Factory marketplace'],
  ['/marketplace/team', 'Factory marketplace'],
  ['/marketplace/factory/code-review', 'Code review'],
  ['/docs', 'Introduction'],
  ['/docs/quickstart', 'Quickstart'],
  ['/docs/how-factories-work', 'How factories work'],
  ['/docs/factory-definition', 'Factory definition'],
]) {
  const response = await site.fetch(new Request(`https://openfactory.test${path}`));
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.ok(html.includes(title), `${path}: rendered page title`);
  assert.ok(html.includes('/assets/'), `${path}: includes client assets`);
  if (path === '/download') {
    const repository =
      process.env.VITE_OPENFACTORY_RELEASES_REPOSITORY ??
      'the-agentic-company/openfactory-releases';
    assert.ok(
      html.includes(`https://github.com/${repository}/releases/download/desktop-v`),
      'Download links use the public installer repository',
    );
  }
  assert.doesNotMatch(html, /href=["']\/app(?:[/"'#?])/, `${path}: no hosted app links`);
  assert.doesNotMatch(html, /Open app|open the web app/i, `${path}: no hosted app invitation`);
  process.stdout.write(`200 ${path}\n`);
}

const installer = await site.fetch(new Request('https://openfactory.test/install.sh'));
assert.equal(installer.status, 200, '/install.sh');
assert.match(installer.headers.get('content-type'), /text\/x-shellscript/);
const installSource = await installer.text();
assert.ok(installSource.startsWith('#!/bin/sh'));
assert.ok(installSource.includes('SHA256SUMS'));
assert.ok(!installSource.includes('__OPENFACTORY_RELEASES_REPOSITORY__'));
const downloadPage = await site.fetch(new Request('https://openfactory.test/download'));
const downloadHtml = await downloadPage.text();
assert.ok(downloadHtml.includes('.dmg'), 'Mac downloads are DMGs');
assert.ok(downloadHtml.includes('.AppImage'), 'Linux includes AppImage');
assert.ok(
  downloadHtml.includes('https://openfactory.test/install.sh'),
  'Install command uses the page origin',
);
process.stdout.write('200 /install.sh (shell script, release repository configured)\n');

for (const path of [
  '/app',
  '/app/settings',
  '/app/projects/private/agents',
  '/api/webhooks/private/token',
  '/downloads/OpenFactory-0.1.1-arm64.zip',
  '/docs/missing-page',
  '/marketplace/factory/missing-example',
  '/marketplace/unknown',
  '/marketplace/unknown/missing-example',
]) {
  const response = await site.fetch(new Request(`https://openfactory.test${path}`));
  assert.equal(response.status, 404, path);
  await response.text();
  process.stdout.write(`404 ${path}\n`);
}

// Check the actual deployment, including lazy chunks and server dependencies.
const output = new URL('../.vercel/output/', import.meta.url);
const workspaceCode =
  /openfactory-pairing-link|OPENFACTORY_CONNECTIONS_FILE|OPENFACTORY_RUNTIME_SOCKET|\.desktop-title-bar|\.workspace-sidebar|\.factory-dashboard/;
let checked = 0;
for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.(?:[cm]?js|css)$/.test(entry.name)) {
    continue;
  }
  const path = `${entry.parentPath}/${entry.name}`;
  assert.doesNotMatch(await readFile(path, 'utf8'), workspaceCode, `${path}: no workspace code`);
  checked++;
}
assert.ok(checked > 0, 'deployment contains assets to inspect');
process.stdout.write(`Verified ${checked} deployment files contain no workspace code.\n`);
