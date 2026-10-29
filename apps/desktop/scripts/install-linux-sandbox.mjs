import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { statSync } from 'node:fs';
import electron from 'electron';

if (process.platform !== 'linux') {
  throw new Error('The Linux sandbox helper is only needed on Linux.');
}
const linuxSandboxPath = join(dirname(electron), 'chrome-sandbox');
const installed = spawnSync('pkexec', ['/usr/bin/chown', 'root:root', linuxSandboxPath], {
  stdio: 'inherit',
});
if (installed.error) {
  throw installed.error;
}
if (installed.status !== 0) {
  process.exit(installed.status ?? 1);
}
const permissions = spawnSync('pkexec', ['/usr/bin/chmod', '4755', linuxSandboxPath], {
  stdio: 'inherit',
});
if (permissions.error) {
  throw permissions.error;
}
if (permissions.status !== 0) {
  process.exit(permissions.status ?? 1);
}
const helper = statSync(linuxSandboxPath);
if (helper.uid !== 0 || (helper.mode & 0o7777) !== 0o4755) {
  throw new Error('The sandbox helper was not installed with the required ownership and mode.');
}
console.log(`Installed sandbox helper at ${linuxSandboxPath}. Electron will use it automatically.`);
