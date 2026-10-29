import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

const unpacked = resolve(
  process.argv[2] ??
    (process.platform === 'darwin'
      ? `dist/${process.arch === 'arm64' ? 'mac-arm64' : 'mac'}/OpenFactory.app`
      : process.platform === 'win32'
        ? 'dist/win-unpacked'
        : 'dist/linux-unpacked'),
);
const resources =
  process.platform === 'darwin'
    ? join(unpacked, 'Contents/Resources')
    : join(unpacked, 'resources');
const executable =
  process.platform === 'darwin'
    ? join(unpacked, 'Contents/MacOS/OpenFactory')
    : join(unpacked, process.platform === 'win32' ? 'OpenFactory.exe' : 'openfactory-prototype');
const dataDir = mkdtempSync(join(tmpdir(), 'openfactory-package-'));
const child = spawn(executable, [join(resources, 'app/src/host.mjs')], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    OPENFACTORY_DESKTOP_HOME: dataDir,
    OPENFACTORY_DESKTOP_PORT: '0',
    OPENFACTORY_RUNTIME_DIR: join(dataDir, 'runtime'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(child, 'exit');
let diagnostics = '';
child.stderr.on('data', (chunk) => {
  diagnostics += chunk;
});
try {
  const deadline = Date.now() + 20000;
  while (!existsSync(join(dataDir, 'connection.json'))) {
    assert.equal(child.exitCode, null, `Packaged host exited: ${diagnostics}`);
    assert.ok(Date.now() < deadline, 'Packaged host did not become ready.');
    await new Promise((accept) => setTimeout(accept, 100));
  }
  const { origin, hostId } = JSON.parse(readFileSync(join(dataDir, 'connection.json'), 'utf8'));
  const token = readFileSync(join(dataDir, 'owner-token'), 'utf8').trim();
  assert.equal((await fetch(`${origin}/v1/state`)).status, 401);
  const state = await (
    await fetch(`${origin}/v1/state`, { headers: { authorization: `Bearer ${token}` } })
  ).json();
  assert.equal(state.host.id, hostId);
  assert.equal(state.background, true);
  assert.deepEqual(state.factories, []);
  assert.deepEqual(state.runs, []);
  assert.ok(existsSync(join(dataDir, 'host.sqlite')), 'Packaged host must persist to SQLite.');
  const batch = await (
    await fetch(`${origin}/v1/sync`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json();
  assert.equal(batch.checkpoint.hostId, hostId);
  assert.equal(batch.documents[0].kind, 'host');
  assert.ok(
    existsSync(join(resources, 'app/web/server/index.mjs')),
    'The shared web server must be bundled.',
  );
  assert.ok(
    existsSync(join(resources, 'app/runtime/runtime.mjs')),
    'The owned runtime must be bundled.',
  );
  const rpc = await (
    await fetch(`${origin}/v1/rpc`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'runtime.status', payload: {} }),
    })
  ).json();
  assert.equal(rpc.value.owner, 'openfactory');
  await fetch(`${origin}/v1/shutdown`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  const [code] = await exited;
  assert.equal(code, 0);
  process.stdout.write(
    'Packaged Electron host starts independently, authenticates requests, persists to SQLite, exposes sync, bundles the shared web interface and owned runtime, and stops cleanly.\n',
  );
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await exited;
  }
  const runtimeLock = join(dataDir, 'runtime/runtime.lock');
  if (existsSync(runtimeLock)) {
    const pid = Number(readFileSync(runtimeLock, 'utf8'));
    assert.ok(Number.isSafeInteger(pid) && pid > 1);
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
    for (let attempt = 0; attempt < 50 && existsSync(runtimeLock); attempt++) {
      await new Promise((accept) => setTimeout(accept, 50));
    }
  }
  rmSync(dataDir, { recursive: true, force: true });
}
