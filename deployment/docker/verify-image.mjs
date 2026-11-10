import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
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
const hostname = 'openfactory.example.test';
let host;
let origin;
let tlsProxy;
let tlsDirectory;
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
  tlsDirectory = mkdtempSync(join(tmpdir(), 'openfactory-tls-'));
  const key = join(tlsDirectory, 'key.pem');
  const cert = join(tlsDirectory, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-subj',
      '/CN=' + hostname,
      '-days',
      '1',
    ],
    { stdio: 'ignore' },
  );
  tlsProxy = createHttpsServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (incoming, outgoing) => {
      const proxied = request(
        {
          hostname: '127.0.0.1',
          port,
          path: incoming.url,
          method: incoming.method,
          headers: { ...incoming.headers, host },
        },
        (response) => {
          const headers = { ...response.headers };
          for (const name of ['connection', 'keep-alive', 'transfer-encoding']) {
            delete headers[name];
          }
          outgoing.writeHead(response.statusCode, headers);
          response.pipe(outgoing);
        },
      );
      proxied.on('error', () => {
        outgoing.writeHead(502);
        outgoing.end();
      });
      incoming.pipe(proxied);
    },
  );
  tlsProxy.listen(0, '127.0.0.1');
  await once(tlsProxy, 'listening');
  host = `${hostname}:${tlsProxy.address().port}`;
  origin = `https://${host}`;
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
  const browser = await chromium.launch({
    headless: true,
    args: [`--host-resolver-rules=MAP ${hostname} 127.0.0.1`, '--no-proxy-server'],
    ...(process.env.OPENFACTORY_TEST_BROWSER_EXECUTABLE
      ? { executablePath: process.env.OPENFACTORY_TEST_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    page.on('requestfailed', (request) =>
      console.error('Browser request failed', request.url(), request.failure()?.errorText),
    );
    await page.goto(origin + '/auth/register');
    const browserEmail = `browser-${randomBytes(5).toString('hex')}@example.test`;
    await page.getByLabel('Email').fill(browserEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.waitForURL(origin + '/app', { timeout: 10000 });
    await page.getByRole('link', { name: 'OpenFactory', exact: true }).waitFor();
    await page.goto(origin + '/auth/account');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(origin + '/auth/login');
    await page.getByLabel('Email').fill(browserEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(origin + '/app');
    await page.getByRole('link', { name: 'OpenFactory', exact: true }).waitFor();
  } finally {
    await browser.close();
  }

  console.log(
    'Verified real image: registration, protected app/API, server-rendered workspace, persistent login, restart, logout, native browser forms, hydrated app, non-root user.',
  );
} catch (error) {
  try {
    process.stderr.write(docker('logs', name));
  } catch {
    /* Container setup may have failed. */
  }
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
  if (tlsProxy?.listening) {
    await new Promise((resolve) => tlsProxy.close(resolve));
  }
  if (tlsDirectory) {
    rmSync(tlsDirectory, { recursive: true, force: true });
  }
}
