import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const snapshot = join(root, '.cache/mac-build/app');
rmSync(snapshot, { recursive: true, force: true });
mkdirSync(snapshot, { recursive: true });
for (const path of ['src', 'web', 'runtime', 'package.json']) {
  cpSync(join(root, path), join(snapshot, path), { recursive: true });
}
symlinkSync(join(root, 'node_modules'), join(snapshot, 'node_modules'), 'dir');
const {
  build: _build,
  devDependencies: _devDependencies,
  scripts: _scripts,
  ...application
} = JSON.parse(readFileSync(join(snapshot, 'package.json'), 'utf8'));
writeFileSync(join(snapshot, 'package.json'), JSON.stringify(application, null, 2));
const { version } = application;
const files = {};
const packageMetadata = {};
function record(directory) {
  for (const entry of readdirSync(join(snapshot, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      record(path);
    } else {
      if (path.includes('/node_modules/') && path.endsWith('/package.json')) {
        packageMetadata[path] = JSON.parse(readFileSync(join(snapshot, path), 'utf8'));
      }
      files[path] = createHash('sha256')
        .update(readFileSync(join(snapshot, path)))
        .digest('hex');
    }
  }
}
record('src');
record('web');
record('runtime');
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(
  join(root, `dist/OpenFactory-${version}-build-manifest.json`),
  JSON.stringify({ version, files, packageMetadata }, null, 2),
);
const require = createRequire(import.meta.url);
const targets = process.platform === 'darwin' ? ['dmg', 'zip'] : ['zip'];
if (process.platform !== 'darwin') {
  process.stderr.write(
    'DMG creation requires macOS. Building ZIP verification archives only on this host.\n',
  );
}
const result = spawnSync(
  process.execPath,
  [
    require.resolve('electron-builder/cli.js'),
    '--mac',
    ...targets,
    '--arm64',
    '--x64',
    '--publish',
    'never',
    `--config.directories.app=${snapshot}`,
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
