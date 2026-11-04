import { spawn } from 'node:child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
export const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  env,
  cwd: new URL('..', import.meta.url),
  stdio:
    process.env.OPENFACTORY_DESKTOP_DEV === '1'
      ? ['inherit', 'inherit', 'inherit', 'ipc']
      : 'inherit',
});
child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  if (process.env.OPENFACTORY_DESKTOP_DEV !== '1') {
    process.exitCode = code ?? 1;
  }
});
