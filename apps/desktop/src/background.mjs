import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const serviceName = 'openfactory-desktop-prototype.service';

export async function installBackgroundService({ executable, hostScript, dataDir, port = 48180 }) {
  await exec('systemctl', ['--user', 'show-environment'], { timeout: 5000 });
  const directory = join(homedir(), '.config/systemd/user');
  mkdirSync(directory, { recursive: true });
  const quote = (value) =>
    `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`;
  const path = `${join(homedir(), '.local/bin')}:/usr/local/bin:/usr/bin:/bin`;
  writeFileSync(
    join(directory, serviceName),
    [
      '[Unit]',
      'Description=OpenFactory prototype agent host',
      'After=network-online.target',
      '[Service]',
      'Type=simple',
      `ExecStart=${quote(executable)} ${quote(hostScript)}`,
      'Environment=ELECTRON_RUN_AS_NODE=1',
      `Environment=${quote(`OPENFACTORY_DESKTOP_HOME=${dataDir}`)}`,
      `Environment=OPENFACTORY_DESKTOP_PORT=${port}`,
      `Environment=${quote(`PATH=${path}`)}`,
      'Restart=on-failure',
      'RestartSec=3',
      'TimeoutStopSec=15',
      'KillMode=control-group',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  await exec('systemctl', ['--user', 'daemon-reload'], { timeout: 10000 });
  await exec('systemctl', ['--user', 'enable', serviceName], { timeout: 10000 });
}

export async function startBackgroundService() {
  await exec('systemctl', ['--user', 'start', serviceName], { timeout: 15000 });
}
