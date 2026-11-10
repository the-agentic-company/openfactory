import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createGateway } from './gateway.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

test('registration, persistent sessions, authenticated proxy, CSRF, and logout', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory-auth-'));
  const upstream = createServer((req, res) =>
    res.end(JSON.stringify({ url: req.url, spoofed: req.headers['x-openfactory-user'] })),
  );
  const target = await listen(upstream);
  // Reserve a port to use the same canonical origin across a restart.
  const reserve = createServer();
  const origin = await listen(reserve);
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  let gateway;
  const start = async (registration = true) => {
    gateway = createGateway({ origin, directory, upstream: target, secure: false, registration });
    gateway.listen(port, '127.0.0.1');
    await once(gateway, 'listening');
  };
  const close = () => new Promise((resolve) => gateway.close(resolve));
  t.after(async () => {
    await close();
    await new Promise((resolve) => upstream.close(resolve));
    await rm(directory, { recursive: true });
  });
  await start();
  const request = (path, init) =>
    fetch(origin + path, {
      redirect: 'manual',
      ...init,
      headers: { connection: 'close', ...init?.headers },
    });
  const form = (email, password = 'long-enough-password') =>
    new URLSearchParams({ email, password });
  const submit = (path, body, cookie) =>
    request(path, { method: 'POST', headers: { origin, ...(cookie ? { cookie } : {}) }, body });
  assert.equal((await request('/app')).status, 303);
  assert.equal((await request('/_serverFn/private')).headers.get('location'), '/auth/login');
  assert.equal((await request('/auth/register')).status, 200);
  assert.equal(
    (await request('/auth/register', { method: 'POST', body: form('a@example.com') })).status,
    403,
  );
  assert.equal((await submit('/auth/register', form('a@example.com', 'short'))).status, 400);
  const registered = await submit('/auth/register', form('a@example.com'));
  assert.equal(registered.status, 303);
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  assert.match(registered.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const response = await request('/app?test=1', {
    headers: { cookie, 'x-openfactory-user': 'admin' },
  });
  assert.deepEqual(await response.json(), { url: '/app?test=1' });
  assert.equal(
    (await request('/private', { method: 'POST', headers: { cookie }, body: 'x' })).status,
    403,
  );
  await close();
  await start();
  assert.equal((await request('/app', { headers: { cookie } })).status, 200);
  assert.equal((await request('/auth/account', { headers: { cookie } })).status, 200);
  assert.equal((await request('/auth/logout', { headers: { cookie } })).status, 405);
  assert.equal((await submit('/auth/logout', new URLSearchParams(), cookie)).status, 303);
  assert.equal((await request('/app', { headers: { cookie } })).status, 303);
  assert.equal(
    (await submit('/auth/login', form('a@example.com', 'wrong-password-123'))).status,
    400,
  );
  assert.equal((await submit('/auth/login', form('A@example.com'))).status, 303);
  assert.equal((await submit('/auth/register', form('a@example.com'))).status, 400);
  const wrongHost = await new Promise((resolve) => {
    httpRequest(origin + '/auth/login', { headers: { host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).end();
  });
  assert.equal(wrongHost, 421);
  await close();
  await start(false);
  assert.equal((await request('/auth/register')).status, 403);
  assert.equal((await submit('/auth/login', form('a@example.com'))).status, 303);
});

test('gateway refuses public upstreams and insecure production origins', () => {
  assert.throws(() =>
    createGateway({
      origin: 'http://example.com',
      directory: '/unused',
      upstream: 'http://127.0.0.1:8019',
    }),
  );
  assert.throws(() =>
    createGateway({
      origin: 'https://example.com',
      directory: '/unused',
      upstream: 'http://example.com',
    }),
  );
});
