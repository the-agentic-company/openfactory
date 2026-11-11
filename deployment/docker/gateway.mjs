import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { createServer, request as proxyRequest } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const derive = promisify(scrypt);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const cookieName = '__Host-openfactory';
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;

function proxyHeaders(original) {
  const headers = { ...original };
  const connection = String(headers.connection ?? '')
    .toLowerCase()
    .split(',')
    .map((name) => name.trim());
  for (const name of [
    ...connection,
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    delete headers[name];
  }
  return headers;
}

export function createGateway({ origin, directory, upstream, registration = true, secure = true }) {
  const canonical = new URL(origin);
  if (canonical.origin !== origin || (!secure && canonical.hostname !== '127.0.0.1')) {
    throw new Error('Use an HTTPS origin; insecure mode is limited to loopback tests.');
  }
  if (secure && canonical.protocol !== 'https:') {
    throw new Error('HTTPS is required.');
  }
  const target = new URL(upstream);
  if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:') {
    throw new Error('Upstream must use loopback HTTP.');
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, 'accounts.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  let passwordOperations = 0;
  const cookie = (token, seconds) =>
    `${secure ? cookieName : 'openfactory-test'}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  const session = (req) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${secure ? cookieName : 'openfactory-test'}=`))
      ?.split('=')[1];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      return null;
    }
    return db
      .prepare(
        'SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ? AND expires > ?',
      )
      .get(hash(token), Date.now());
  };
  function reply(res, status, content, headers = {}) {
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      ...headers,
    });
    res.end(content);
  }
  const redirect = (res, path, headers = {}) => reply(res, 303, '', { location: path, ...headers });
  function page(res, action, error = '') {
    const registering = action === 'register';
    reply(
      res,
      error ? 400 : 200,
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${registering ? 'Create account' : 'Sign in'} · OpenFactory</title><style>body{font:14px system-ui;color:#242421;background:#fafaf8;margin:0}main{max-width:340px;margin:12vh auto;padding:24px}h1{font-size:24px;font-weight:500}label{display:block;margin:18px 0 6px}input,button{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d7d7d1;border-radius:6px;font:inherit}button{margin-top:22px;background:#242421;color:white;cursor:pointer}a{color:inherit}p{line-height:1.5;color:#62625b}.error{color:#a12622}</style><main><h1>${registering ? 'Create your account' : 'Sign in to OpenFactory'}</h1><p>This is a shared team workspace. Members can access its paired machines and factories.</p>${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}<form method="post" action="/auth/${action}"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" minlength="12" maxlength="128" required><button>${registering ? 'Create account' : 'Sign in'}</button></form><p><a href="/auth/${registering ? 'login' : 'register'}">${registering ? 'Already have an account? Sign in' : registration ? 'Create an account' : ''}</a></p></main></html>`,
    );
  }
  const server = createServer(async (req, res) => {
    try {
      if (
        req.url === '/healthz' &&
        req.method === 'GET' &&
        req.headers.host?.startsWith('127.0.0.1:')
      ) {
        const response = await fetch(new URL('/app', target), {
          signal: AbortSignal.timeout(3000),
        });
        return reply(res, response.ok ? 200 : 503, response.ok ? 'Ready' : 'Unavailable');
      }
      if (req.headers.host !== canonical.host) {
        return reply(res, 421, 'Unrecognized host.');
      }
      const url = new URL(req.url, origin);
      if (url.origin !== origin) {
        return reply(res, 400, 'Invalid request.');
      }
      const user = session(req);
      if (url.pathname.startsWith('/auth/')) {
        const action = url.pathname.slice(6);
        if (!['login', 'register', 'logout', 'account'].includes(action)) {
          return reply(res, 404, 'Not found.');
        }
        if (action === 'register' && !registration) {
          return reply(res, 403, 'Registration is disabled.');
        }
        if (req.method === 'GET') {
          if (action === 'logout') {
            return reply(res, 405, 'Use the sign out form.');
          }
          if (action === 'account') {
            if (!user) {
              return redirect(res, '/auth/login');
            }
            return reply(
              res,
              200,
              `<!doctype html><title>Account · OpenFactory</title><p>Signed in as ${escape(user.email)}</p><p><a href="/app">Open workspace</a></p><form method="post" action="/auth/logout"><button>Sign out</button></form>`,
            );
          }
          if (user) {
            return redirect(res, '/app');
          }
          return page(res, action);
        }
        if (req.method !== 'POST') {
          return reply(res, 405, 'Method not allowed.');
        }
        if (
          req.headers.origin !== origin ||
          req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded'
        ) {
          return reply(res, 403, 'Invalid form origin.');
        }
        if (action === 'logout') {
          const token = req.headers.cookie
            ?.split(';')
            .map((v) => v.trim())
            .find((v) => v.startsWith(`${secure ? cookieName : 'openfactory-test'}=`))
            ?.split('=')[1];
          if (token) {
            db.prepare('DELETE FROM sessions WHERE token = ?').run(hash(token));
          }
          return redirect(res, '/auth/login', { 'set-cookie': cookie('', 0) });
        }
        if (action === 'account') {
          return reply(res, 405, 'Method not allowed.');
        }
        db.prepare('DELETE FROM attempts WHERE expires < ?').run(Date.now());
        db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
        const key = req.socket.remoteAddress ?? 'unknown';
        const attempt = db
          .prepare(
            'INSERT INTO attempts VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count',
          )
          .get(key, Date.now() + 60_000);
        if (attempt.count > 30 || passwordOperations >= 2) {
          return reply(res, 429, 'Please wait before trying again.', { 'retry-after': '60' });
        }
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 2048) {
            return reply(res, 413, 'Form too large.');
          }
        }
        const form = new URLSearchParams(body);
        const email = (form.get('email') ?? '').trim().toLowerCase();
        const password = form.get('password') ?? '';
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254 ||
          password.length < 12 ||
          password.length > 128
        ) {
          return page(res, action, 'Use a valid email and a password of 12–128 characters.');
        }
        passwordOperations++;
        let id;
        try {
          const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
          const salt = existing?.salt ?? randomBytes(32).toString('hex');
          const derived = await derive(password, salt, 64, {
            N: 32768,
            r: 8,
            p: 1,
            maxmem: 64 * 1024 * 1024,
          });
          if (action === 'register') {
            if (existing) {
              return page(res, action, 'Unable to create account. Try signing in.');
            }
            if (db.prepare('SELECT count(*) AS count FROM users').get().count >= 100) {
              return reply(res, 403, 'Account limit reached. Contact your administrator.');
            }
            id = randomUUID();
            db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(
              id,
              email,
              salt,
              derived.toString('hex'),
            );
          } else {
            if (!existing || !timingSafeEqual(derived, Buffer.from(existing.password, 'hex'))) {
              return page(res, action, 'Email or password is incorrect.');
            }
            id = existing.id;
          }
        } finally {
          passwordOperations--;
        }
        const token = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(
          hash(token),
          id,
          Date.now() + sessionLifetime,
        );
        return redirect(res, '/app', { 'set-cookie': cookie(token, sessionLifetime / 1000) });
      }
      if (!user) {
        return redirect(res, '/auth/login');
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) {
        return reply(res, 403, 'Invalid request origin.');
      }
      const headers = { ...proxyHeaders(req.headers), host: target.host };
      for (const name of [...Object.keys(headers)]) {
        if (
          name.startsWith('x-forwarded-') ||
          name.startsWith('x-openfactory-') ||
          ['forwarded', 'authorization', 'connection', 'upgrade', 'proxy-authorization'].includes(
            name,
          )
        ) {
          delete headers[name];
        }
      }
      headers['x-forwarded-proto'] = canonical.protocol.slice(0, -1);
      headers['x-forwarded-host'] = canonical.host;
      const proxied = proxyRequest(
        {
          hostname: '127.0.0.1',
          port: target.port,
          path: url.pathname + url.search,
          method: req.method,
          headers,
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, {
            ...proxyHeaders(response.headers),
            'cache-control': 'no-store',
            'strict-transport-security': 'max-age=31536000',
          });
          response.pipe(res);
        },
      );
      proxied.on('error', () => {
        if (!res.headersSent) {
          reply(res, 502, 'Workspace unavailable.');
        } else {
          res.destroy();
        }
      });
      req.on('aborted', () => proxied.destroy());
      req.pipe(proxied);
    } catch {
      if (!res.headersSent) {
        reply(res, 500, 'Request failed.');
      } else {
        res.destroy();
      }
    }
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.on('upgrade', (_req, socket) => socket.destroy());
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createGateway({
    origin: process.env.OPENFACTORY_PUBLIC_URL,
    directory: process.env.OPENFACTORY_AUTH_DIR ?? '/data/auth',
    upstream: 'http://127.0.0.1:8019',
    registration: process.env.OPENFACTORY_REGISTRATION !== 'disabled',
  });
  server.listen(8080, '0.0.0.0', () =>
    console.log('OpenFactory authentication gateway listening on :8080'),
  );
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
