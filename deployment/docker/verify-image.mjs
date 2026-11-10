import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

const image = process.argv[2];
if (!image) {
  throw new Error('Usage: node deployment/docker/verify-image.mjs <image>');
}
const name = `openfactory-verify-${randomBytes(5).toString('hex')}`;
const volume = `${name}-data`;
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const host = 'openfactory.example.test';
const origin = `https://${host}`;
let port;
function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          host,
          connection: 'close',
          ...(cookie ? { cookie } : {}),
          ...(body ? { origin, 'content-type': 'application/x-www-form-urlencoded' } : {}),
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      },
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Image request timed out')));
    req.end(body);
  });
}
async function ready() {
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      if ((await call('/auth/login')).status === 200) {
        return;
      }
    } catch {
      /* Container startup is asynchronous. */
    }
    await setTimeout(1000);
  }
  throw new Error('Image did not become ready');
}
try {
  docker('volume', 'create', volume);
  docker(
    'run',
    '-d',
    '--name',
    name,
    '-p',
    '127.0.0.1::8080',
    '-e',
    `OPENFACTORY_PUBLIC_URL=${origin}`,
    '-v',
    `${volume}:/data`,
    image,
  );
  port = Number(docker('port', name, '8080/tcp').split(':').at(-1));
  await ready();
  assert.equal((await call('/app')).headers.location, '/auth/login');
  assert.equal((await call('/_serverFn/private')).headers.location, '/auth/login');
  const email = `verify-${randomBytes(5).toString('hex')}@example.test`;
  const password = randomBytes(24).toString('hex');
  const registered = await call('/auth/register', {
    method: 'POST',
    body: new URLSearchParams({ email, password }).toString(),
  });
  assert.equal(registered.status, 303, registered.text);
  const cookie = registered.headers['set-cookie'][0].split(';')[0];
  assert.match(registered.headers['set-cookie'][0], /__Host-openfactory=.*Secure/);
  const app = await call('/app', { cookie });
  assert.equal(app.status, 200, app.text);
  assert.match(app.text, /OpenFactory/);
  docker('restart', name);
  port = Number(docker('port', name, '8080/tcp').split(':').at(-1));
  await ready();
  assert.equal((await call('/app', { cookie })).status, 200);
  const account = await call('/auth/account', { cookie });
  assert.equal(account.status, 200, JSON.stringify(account));
  assert.equal(
    (await call('/auth/logout', { method: 'POST', body: 'logout=1', cookie })).status,
    303,
  );
  assert.equal((await call('/app', { cookie })).headers.location, '/auth/login');
  const login = await call('/auth/login', {
    method: 'POST',
    body: new URLSearchParams({ email, password }).toString(),
  });
  assert.equal(login.status, 303, login.text);
  assert.equal(JSON.parse(docker('inspect', name))[0].Config.User, 'node');
  console.log(
    'Verified real image: registration, protected app/API, server-rendered workspace, persistent login, restart, logout, non-root user.',
  );
} catch (error) {
  process.stderr.write(docker('logs', name));
  throw error;
} finally {
  try {
    docker('rm', '-f', name);
  } catch {
    /* Keep the original verification failure. */
  }
  try {
    docker('volume', 'rm', volume);
  } catch {
    /* Keep the original verification failure. */
  }
}
