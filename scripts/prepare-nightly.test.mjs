import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function fixture(t, version = '0.1.3') {
  const root = mkdtempSync(join(tmpdir(), 'openfactory-nightly-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'apps/desktop'), { recursive: true });
  const script = join(root, 'scripts/prepare-nightly.mjs');
  copyFileSync(new URL('./prepare-nightly.mjs', import.meta.url), script);
  const manifest = join(root, 'apps/desktop/package.json');
  writeFileSync(
    manifest,
    JSON.stringify({ name: '@openfactory/desktop', version, build: { mac: {} } }),
  );
  return {
    run: (number) =>
      execFileSync(process.execPath, [script], {
        env: { ...process.env, GITHUB_RUN_NUMBER: number },
        stdio: 'pipe',
      }),
    read: () => JSON.parse(readFileSync(manifest, 'utf8')),
  };
}

void test('independent build jobs produce the same nightly version and preserve build settings', (t) => {
  const desktop = fixture(t);
  const cli = fixture(t);
  desktop.run('123');
  cli.run('123');
  assert.deepEqual(desktop.read(), {
    name: '@openfactory/desktop',
    version: '0.1.4-nightly.123',
    build: { mac: {} },
  });
  assert.deepEqual(cli.read(), desktop.read());
  const next = fixture(t);
  next.run('124');
  assert.equal(next.read().version, '0.1.4-nightly.124');
});

void test('invalid run numbers and non-stable base versions fail without changing the package', (t) => {
  for (const run of ['', '0', '-1', '123/other', '1.2']) {
    const f = fixture(t);
    assert.throws(() => f.run(run), /Nightly builds require GITHUB_RUN_NUMBER/);
    assert.equal(f.read().version, '0.1.3');
  }
  for (const version of ['0.1.4-nightly.123', '0.1.3.4']) {
    const f = fixture(t, version);
    assert.throws(() => f.run('123'), /must have a stable version/);
    assert.equal(f.read().version, version);
  }
});
