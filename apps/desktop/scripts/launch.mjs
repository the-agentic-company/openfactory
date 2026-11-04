import { spawn } from 'node:child_process';
import electron from 'electron';

export function launchElectron() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return spawn(electron, ['.'], {
    env,
    cwd: new URL('..', import.meta.url),
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });
}
