import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'apps/desktop');
const { version } = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8'));
const image = join(desktop, 'dist', `OpenFactory-${version}-x86_64.AppImage`);
assert.ok((await stat(image)).mode & 0o111, 'AppImage must be executable.');
const file = await open(image);
try {
  const header = Buffer.alloc(11);
  await file.read(header, 0, header.length, 0);
  assert.equal(header.subarray(0, 4).toString('hex'), '7f454c46');
  assert.equal(header.subarray(8, 11).toString('hex'), '414902', 'Expected a type-2 AppImage.');
} finally {
  await file.close();
}
const directory = await mkdtemp(join(tmpdir(), 'openfactory-appimage-'));
try {
  await exec(image, ['--appimage-extract'], { cwd: directory, maxBuffer: 16 * 1024 * 1024 });
  const result = await exec(
    process.execPath,
    [join(desktop, 'scripts/verify-package.mjs'), join(directory, 'squashfs-root')],
    { cwd: desktop, timeout: 30000 },
  );
  process.stdout.write(result.stdout);
  process.stdout.write(
    'AppImage format, executable permissions, extracted host, and runtime verified.\n',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
