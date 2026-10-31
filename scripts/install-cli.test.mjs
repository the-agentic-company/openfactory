import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const installer = new URL('../apps/site/src/install.sh', import.meta.url);

async function fixture(
  t,
  { system = 'Linux', machine = 'x86_64', platform = 'linux', arch = 'x64' } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory install '));
  const payload = join(directory, 'payload');
  const commands = join(directory, 'commands');
  await mkdir(payload);
  await mkdir(commands);
  await writeFile(
    join(commands, 'uname'),
    `#!/bin/sh\ncase "$1" in -s) printf '%s\\n' '${system}';; -m) printf '%s\\n' '${machine}';; esac\n`,
    { mode: 0o755 },
  );
  await writeFile(join(payload, 'node'), '#!/bin/sh\nprintf "v26.0.0\\n"\n', { mode: 0o755 });
  await writeFile(join(payload, 'openfactory'), '#!/bin/sh\nprintf "1.2.3\\n"\n', { mode: 0o755 });
  await writeFile(join(payload, 'runtime.mjs'), 'export {};\n');
  await exec('tar', ['-czf', join(directory, 'cli.tar.gz'), '-C', directory, 'payload']);
  const bytes = await readFile(join(directory, 'cli.tar.gz'));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const script = await readFile(installer, 'utf8');
  const state = { version: '1.2.3', checksum: digest, archiveStatus: 200, requests: [] };
  const server = createServer((request, response) => {
    state.requests.push(request.url);
    const name = `openfactory-cli-${state.version}-${platform}-${arch}.tar.gz`;
    if (request.url === '/install.sh') {
      response.setHeader('Content-Type', 'text/x-shellscript');
      response.end(script);
    } else if (request.url === '/latest') {
      response.end(JSON.stringify({ tag_name: `desktop-v${state.version}` }));
    } else if (request.url === `/releases/desktop-v${state.version}/SHA256SUMS`) {
      response.end(`${state.checksum}  ${name}\n`);
    } else if (request.url === `/releases/desktop-v${state.version}/${name}`) {
      response.writeHead(state.archiveStatus);
      response.end(bytes);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  t.after(async () => {
    await new Promise((accept, reject) =>
      server.close((error) => (error ? reject(error) : accept())),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${address.port}`;
  const home = join(directory, 'CLI home');
  const bin = join(directory, 'bin with spaces');
  const env = {
    ...process.env,
    PATH: `${commands}:${process.env.PATH}`,
    OPENFACTORY_HOME: home,
    OPENFACTORY_INSTALL_BIN_DIR: bin,
    OPENFACTORY_RELEASE_BASE_URL: `${origin}/releases`,
    OPENFACTORY_RELEASES_URL: `${origin}/latest`,
    OPENFACTORY_VERSION: '',
  };
  return {
    state,
    home,
    bin,
    env,
    pipe: () =>
      exec('sh', ['-c', 'curl -fsSL "$OPENFACTORY_TEST_ORIGIN/install.sh" | sh'], {
        env: { ...env, OPENFACTORY_TEST_ORIGIN: origin },
        timeout: 15000,
      }),
    run: (overrides = {}) =>
      exec('sh', [installer.pathname], { env: { ...env, ...overrides }, timeout: 15000 }),
  };
}

void test('downloads, verifies and installs through the same curl pipe a visitor runs, with spaces in install paths', async (t) => {
  const f = await fixture(t);
  const { stdout } = await f.pipe();
  assert.match(stdout, /Installed OpenFactory 1.2.3/);
  assert.equal(
    await readlink(join(f.bin, 'openfactory')),
    join(f.home, 'runtime/versions/1.2.3/openfactory'),
  );
  assert.equal((await exec(join(f.bin, 'openfactory'), ['--version'])).stdout.trim(), '1.2.3');
  assert.equal(
    await readFile(join(f.home, 'runtime/versions/1.2.3/.install-complete'), 'utf8'),
    '1.2.3\n',
  );
  assert.ok(f.state.requests.includes('/releases/desktop-v1.2.3/SHA256SUMS'));
});

void test('rerunning a complete installation does not download it again', async (t) => {
  const f = await fixture(t);
  await f.run();
  f.state.requests.length = 0;
  const result = await f.run({ OPENFACTORY_VERSION: '1.2.3' });
  assert.match(result.stdout, /already installed/);
  assert.deepEqual(f.state.requests, []);
});

void test('a bad checksum leaves the previously installed command working', async (t) => {
  const f = await fixture(t);
  await f.run();
  const previous = await readlink(join(f.bin, 'openfactory'));
  f.state.version = '2.0.0';
  f.state.checksum = '0'.repeat(64);
  await assert.rejects(f.run(), (error) => /Checksum mismatch/.test(error.stderr));
  assert.equal(await readlink(join(f.bin, 'openfactory')), previous);
  assert.equal((await exec(join(f.bin, 'openfactory'), ['--version'])).stdout.trim(), '1.2.3');
});

void test('an unavailable archive does not install a launcher', async (t) => {
  const f = await fixture(t);
  f.state.archiveStatus = 404;
  await assert.rejects(f.run(), (error) => /Could not download the CLI/.test(error.stderr));
  await assert.rejects(readlink(join(f.bin, 'openfactory')), { code: 'ENOENT' });
});

void test('does not overwrite an existing command owned by someone else', async (t) => {
  const f = await fixture(t);
  await mkdir(f.bin);
  await writeFile(join(f.bin, 'openfactory'), 'my existing command');
  await assert.rejects(f.run(), (error) => /already exists/.test(error.stderr));
  assert.equal(await readFile(join(f.bin, 'openfactory'), 'utf8'), 'my existing command');
});

for (const device of [
  { system: 'Darwin', machine: 'arm64', platform: 'darwin', arch: 'arm64' },
  { system: 'Darwin', machine: 'x86_64', platform: 'darwin', arch: 'x64' },
  { system: 'Linux', machine: 'aarch64', platform: 'linux', arch: 'arm64' },
]) {
  void test(`selects the published archive for ${device.system} ${device.machine}`, async (t) => {
    const f = await fixture(t, device);
    await f.run();
    assert.ok(
      f.state.requests.includes(
        `/releases/desktop-v1.2.3/openfactory-cli-1.2.3-${device.platform}-${device.arch}.tar.gz`,
      ),
    );
  });
}

void test('rejects invalid versions and unsupported systems without requesting assets', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run({ OPENFACTORY_VERSION: '../../elsewhere' }), (error) =>
    /invalid/.test(error.stderr),
  );
  assert.deepEqual(f.state.requests, []);
  const unsupported = await fixture(t, { system: 'FreeBSD' });
  await assert.rejects(unsupported.run(), (error) => /supports macOS and Linux/.test(error.stderr));
  assert.deepEqual(unsupported.state.requests, []);
});
