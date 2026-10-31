import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const webOutput = join(root, '.cache/workspace-app');
const runtimeOutput = join(root, '.cache/workspace-runtime');
function run(args, environment = {}) {
  return new Promise((accept, reject) => {
    const pnpm = process.env.npm_execpath;
    if (!pnpm) {
      reject(new Error('Run the workspace build through pnpm build:workspace.'));
      return;
    }
    const javascriptCli = /\.[cm]?js$/.test(pnpm);
    const child = spawn(
      javascriptCli ? process.execPath : pnpm,
      javascriptCli ? [pnpm, ...args] : args,
      {
        cwd: root,
        env: { ...process.env, ...environment },
        stdio: 'inherit',
      },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? accept() : reject(new Error(`Workspace build exited with ${code}.`)),
    );
  });
}
await run(['--filter', '@openfactory/runtime', 'exec', 'vp', 'build', '--outDir', runtimeOutput]);
await run(['--filter', '@openfactory/app', 'build'], { OPENFACTORY_APP_OUTPUT_DIR: webOutput });
rmSync(join(root, 'web'), { recursive: true, force: true });
cpSync(webOutput, join(root, 'web'), { recursive: true, dereference: true });
mkdirSync(join(root, 'runtime'), { recursive: true });
cpSync(join(runtimeOutput, 'runtime.mjs'), join(root, 'runtime/runtime.mjs'));
