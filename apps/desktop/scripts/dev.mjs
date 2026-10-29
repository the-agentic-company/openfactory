import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (!existsSync(join(root, 'runtime/runtime.mjs'))) {
  const built = spawnSync(process.execPath, [join(root, 'scripts/build-workspace.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  if (built.status !== 0) {
    process.exit(built.status ?? 1);
  }
}
process.env.OPENFACTORY_DESKTOP_DEV = '1';
await import('./launch.mjs');
