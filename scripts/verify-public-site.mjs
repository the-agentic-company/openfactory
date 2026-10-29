import assert from 'node:assert/strict';

const { default: site } = await import('../.vercel/output/functions/__server.func/index.mjs');

for (const [path, title] of [
  ['/', 'Your agents, on your computers'],
  ['/download', 'Download OpenFactory'],
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
  process.stdout.write(`200 ${path}\n`);
}

for (const path of [
  '/app',
  '/app/settings',
  '/app/projects/private/agents',
  '/api/webhooks/private/token',
  '/downloads/OpenFactory-0.1.1-arm64.zip',
  '/docs/missing-page',
]) {
  const response = await site.fetch(new Request(`https://openfactory.test${path}`));
  assert.equal(response.status, 404, path);
  await response.text();
  process.stdout.write(`404 ${path}\n`);
}
