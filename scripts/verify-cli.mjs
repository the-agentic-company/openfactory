import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8'));
const archive = `openfactory-cli-${version}-${process.platform}-${process.arch}.tar.gz`;
const bytes = await readFile(join(root, 'apps/desktop/dist', archive));
const checksum = createHash('sha256').update(bytes).digest('hex');
const script = await readFile(join(root, 'apps/web/src/install.sh'), 'utf8');
const server = createServer((request, response) => {
  if (request.url === '/install.sh') {
    response.end(script);
  } else if (request.url === `/releases/desktop-v${version}/SHA256SUMS`) {
    response.end(`${checksum}  ${archive}\n`);
  } else if (request.url === `/releases/desktop-v${version}/${archive}`) {
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
const origin = `http://127.0.0.1:${address.port}`;
const temporary = await mkdtemp(join(tmpdir(), 'openfactory-cli-verify-'));
let child;
let exited;
try {
  const command = join(temporary, 'bin/openfactory');
  const env = {
    ...process.env,
    OPENFACTORY_RUNTIME_DIR: join(temporary, 'runtime'),
    OPENFACTORY_HOME: join(temporary, 'CLI home'),
    OPENFACTORY_INSTALL_BIN_DIR: join(temporary, 'bin'),
    OPENFACTORY_VERSION: version,
    OPENFACTORY_RELEASE_BASE_URL: `${origin}/releases`,
    OPENFACTORY_TEST_ORIGIN: origin,
  };
  await exec('sh', ['-c', 'curl -fsSL "$OPENFACTORY_TEST_ORIGIN/install.sh" | sh'], { env });
  assert.equal((await exec(command, ['--version'], { env })).stdout.trim(), version);
  assert.match((await exec(command, ['--help'], { env })).stdout, /openfactory <command>/);
  child = spawn(command, ['serve'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  exited = once(child, 'exit');
  let diagnostics = '';
  child.stderr.on('data', (chunk) => {
    diagnostics += chunk;
  });
  await new Promise((accept, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`CLI runtime startup timed out: ${diagnostics}`)),
      15000,
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('OpenFactory runtime listening')) {
        clearTimeout(timer);
        accept();
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`CLI exited ${code}: ${diagnostics}`));
    });
  });
  const status = JSON.parse((await exec(command, ['status'], { env })).stdout);
  assert.equal(status.owner, 'openfactory');
  assert.equal(status.directory, env.OPENFACTORY_RUNTIME_DIR);
  child.kill('SIGTERM');
  const [code] = await exited;
  assert.equal(code, 0);
  process.stdout.write(
    'The curl-to-shell installer installs the packaged CLI, which starts its isolated runtime, answers status over IPC, and stops cleanly.\n',
  );
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await exited;
  }
  await new Promise((accept, reject) =>
    server.close((error) => (error ? reject(error) : accept())),
  );
  await rm(temporary, { recursive: true, force: true });
}
