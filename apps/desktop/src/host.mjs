import { createServer } from 'node:http';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { z } from 'zod';
import { openHostStore } from './host-store.mjs';
import { runtimeRequest } from './runtime-client.mjs';
import { ensureWorkspaceRuntime } from './workspace-services.mjs';

export const defaultDataDir = () =>
  process.env.OPENFACTORY_DESKTOP_HOME ??
  join(homedir(), '.local/share/openfactory-desktop-prototype');

const hash = (value) => createHash('sha256').update(value).digest('hex');
const matches = (value, digest) => timingSafeEqual(Buffer.from(hash(value)), Buffer.from(digest));
const text = z.string().trim().min(1).max(200);
const factoryInput = z.object({ name: text, directory: z.string().min(1).max(4096) }).strict();
const agentInput = z
  .object({
    factoryId: z.uuid(),
    name: text,
    prompt: z.string().trim().min(1).max(32000),
    sandbox: z.enum(['read-only', 'workspace-write']).default('read-only'),
    intervalMinutes: z.number().int().min(1).max(525600).nullable().default(null),
  })
  .strict();

function save(path, data) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(temporary, path);
}

function fault(status, message) {
  return Object.assign(new Error(message), { status });
}

async function body(request, limit = 65536) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw fault(415, 'Send JSON content.');
  }
  let content = '';
  for await (const chunk of request) {
    content += chunk;
    if (Buffer.byteLength(content) > limit) {
      throw fault(413, 'Request is too large.');
    }
  }
  try {
    return JSON.parse(content);
  } catch {
    throw fault(400, 'Invalid JSON.');
  }
}

export function validateOrigin(value) {
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a computer address without a path, password, or query.');
  }
  if (
    !(local && url.protocol === 'http:') &&
    !(url.protocol === 'https:' && url.hostname.endsWith('.ts.net'))
  ) {
    throw new Error('Use a private Tailscale HTTPS address, or localhost for a local test.');
  }
  return url.origin;
}

export async function startHost(options = {}) {
  const dataDir = options.dataDir ?? defaultDataDir();
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const clock = options.clock ?? Date.now;
  const lockPath = join(dataDir, 'host.lock');
  try {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
    const pid = Number(readFileSync(lockPath, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new Error('The host lock is unreadable. Inspect host.lock before restarting.');
    }
    try {
      process.kill(pid, 0);
      throw new Error('An OpenFactory host is already using this data folder.');
    } catch (probeError) {
      if (probeError.code !== 'ESRCH') {
        throw probeError;
      }
      rmSync(lockPath);
      writeFileSync(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 });
    }
  }
  const releaseLock = () => rmSync(lockPath, { force: true });
  let store;
  try {
    const ownerPath = join(dataDir, 'owner-token');
    store = openHostStore(dataDir, {
      version: 1,
      id: randomUUID(),
      name: hostname(),
      factories: [],
      agents: [],
      runs: [],
      peers: [],
    });
    const state = store.state;
    const listeners = new Set();
    const ownerToken = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(
        existsSync(ownerPath)
          ? readFileSync(ownerPath, 'utf8').trim()
          : randomBytes(32).toString('hex'),
      );
    writeFileSync(ownerPath, ownerToken, { mode: 0o600 });
    const ownerDigest = hash(ownerToken);
    const persist = () => {
      if (store.save(state, snapshot())) {
        for (const listener of listeners) {
          listener();
        }
      }
    };
    for (const run of state.runs) {
      if (run.status === 'running' || run.status === 'queued') {
        run.status = 'interrupted';
        run.finishedAt = new Date().toISOString();
        run.error = 'The host restarted before this run completed. Run it again when ready.';
      }
    }
    let pairing = null;
    let active = null;
    let closing = false;
    let exposedOrigin = options.advertisedOrigin
      ? validateOrigin(options.advertisedOrigin)
      : (state.address ?? null);
    const executable = options.codexExecutable ?? process.env.OPENFACTORY_CODEX_PATH ?? 'codex';
    const provider = spawnSync(executable, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    const providerReady = provider.status === 0;
    const publicHost = () => ({ id: state.id, name: state.name, version: 1, workspaceProtocol: 1 });
    const snapshot = () => ({
      host: publicHost(),
      factories: state.factories,
      agents: state.agents,
      runs: state.runs.toReversed().slice(0, 200),
      peers: state.peers.map(({ id, name, createdAt }) => ({ id, name, createdAt })),
      provider: { name: 'Codex CLI', ready: providerReady },
      address: exposedOrigin,
      background: true,
    });

    persist();

    const finish = (run, status, error = null) => {
      run.status = status;
      run.error = error;
      run.finishedAt = new Date().toISOString();
      active = null;
      persist();
      if (!closing) {
        setImmediate(pump);
      }
    };

    function pump() {
      if (active || closing) {
        return;
      }
      const run = state.runs.find((entry) => entry.status === 'queued');
      if (!run) {
        return;
      }
      run.status = 'running';
      run.startedAt = new Date().toISOString();
      persist();
      const child = spawn(
        executable,
        [
          'exec',
          '--json',
          '--color',
          'never',
          '--sandbox',
          run.sandbox,
          '--skip-git-repo-check',
          '--cd',
          run.directory,
          '-',
        ],
        {
          cwd: run.directory,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          windowsHide: true,
        },
      );
      active = { child, run, cancelled: false };
      let pending = '';
      let failure = '';
      let completed = false;
      let providerError = null;
      const consume = (line) => {
        try {
          const event = JSON.parse(line);
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
            run.output = `${run.output}${event.item.text}\n`.slice(-100000);
            persist();
          }
          if (event.type === 'turn.completed') {
            completed = true;
          }
          if (event.type === 'turn.failed' || event.type === 'error') {
            providerError =
              event.error?.message ?? event.message ?? 'The provider could not complete the run.';
          }
        } catch {
          // Provider diagnostics can include non-JSON lines; stderr is retained separately.
        }
      };
      child.stdout.on('data', (chunk) => {
        pending += chunk;
        const lines = pending.split('\n');
        pending = lines.pop().slice(-200000);
        lines.forEach(consume);
      });
      child.stderr.on('data', (chunk) => {
        failure = `${failure}${chunk}`.slice(-10000);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(run.prompt);
      child.on('error', (error) => finish(run, 'failed', `Cannot start Codex: ${error.message}`));
      child.on('close', (code) => {
        if (run.status !== 'running') {
          return;
        }
        if (pending.trim()) {
          consume(pending);
        }
        if (active?.cancelled) {
          finish(run, 'cancelled');
        } else if (code === 0 && completed && !providerError) {
          finish(run, 'succeeded');
        } else {
          finish(
            run,
            'failed',
            providerError ??
              (failure.trim() || `Codex exited with status ${code} without completing a turn.`),
          );
        }
      });
    }

    function enqueue(agent, input = {}) {
      if (!providerReady) {
        throw fault(
          409,
          'Install the Codex CLI and sign in on this computer, then restart the OpenFactory host.',
        );
      }
      if (
        !input.requestId &&
        state.runs.some(
          (run) => run.agentId === agent.id && ['queued', 'running'].includes(run.status),
        )
      ) {
        throw fault(409, 'This agent already has a run in progress.');
      }
      const factory = state.factories.find((entry) => entry.id === agent.factoryId);
      const run = {
        id: randomUUID(),
        agentId: agent.id,
        agentName: agent.name,
        factoryId: factory.id,
        directory: factory.directory,
        prompt: input.prompt ?? agent.prompt,
        requestId: input.requestId,
        messageId: input.messageId,
        sandbox: agent.sandbox,
        status: 'queued',
        output: '',
        error: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
      };
      state.runs.push(run);
      // Keep active runs and the most recent history; output is bounded per run.
      state.runs = state.runs.filter(
        (entry, index) =>
          index >= state.runs.length - 200 || ['queued', 'running'].includes(entry.status),
      );
      persist();
      setImmediate(pump);
      return run;
    }

    function stopActive() {
      if (!active) {
        return;
      }
      active.cancelled = true;
      const child = active.child;
      const kill = (signal) => {
        try {
          if (process.platform === 'win32') {
            child.kill(signal);
          } else {
            process.kill(-child.pid, signal);
          }
        } catch {
          // An exited process needs no cancellation.
        }
      };
      kill('SIGTERM');
      const force = setTimeout(() => kill('SIGKILL'), 3000);
      force.unref();
      child.once('close', () => clearTimeout(force));
    }

    const server = createServer(async (request, response) => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('cache-control', 'no-store');
      response.setHeader('x-content-type-options', 'nosniff');
      const send = (value, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(value));
      };
      try {
        if (request.headers.origin || request.headers['sec-fetch-site']) {
          throw fault(403, 'Use the OpenFactory app to connect.');
        }
        const url = new URL(request.url, 'http://localhost');
        const path = url.pathname;
        const method = request.method;
        if (path === '/v1/identity' && method === 'GET') {
          return send(publicHost());
        }
        if (path === '/v1/pair' && method === 'POST') {
          const input = z
            .object({ code: z.string().min(1).max(100), name: text })
            .strict()
            .parse(await body(request));
          if (!pairing || pairing.expiresAt <= clock() || pairing.attempts >= 5) {
            throw fault(
              403,
              'Pairing expired or unavailable. Create a new code on the other computer.',
            );
          }
          pairing.attempts++;
          if (!matches(input.code.replaceAll(' ', ''), pairing.digest)) {
            throw fault(403, 'Incorrect pairing code. Check the code on the other computer.');
          }
          pairing = null;
          const token = randomBytes(32).toString('hex');
          const peer = {
            id: randomUUID(),
            name: input.name,
            digest: hash(token),
            createdAt: new Date().toISOString(),
          };
          state.peers.push(peer);
          persist();
          return send({ host: publicHost(), token, peerId: peer.id });
        }
        const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
        const owner = matches(token, ownerDigest);
        const peer = state.peers.find((entry) => matches(token, entry.digest));
        if (!owner && !peer) {
          throw fault(401, 'Access was revoked or is no longer valid. Pair this computer again.');
        }
        if (path === '/v1/rpc' && method === 'POST') {
          const input = z
            .object({ method: z.string(), payload: z.unknown() })
            .parse(await body(request, 100_000_000));
          if (input.method === 'migration.import' || input.method === 'definitions.migrate') {
            throw fault(403, 'Import runtime data on the host computer.');
          }
          return send({ value: await runtimeRequest(input.method, input.payload) });
        }
        if (path === '/v1/sync' && method === 'GET') {
          const { after, limit } = z
            .object({
              after: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
              limit: z.coerce.number().int().min(1).max(100).default(100),
            })
            .parse(Object.fromEntries(url.searchParams));
          return send(store.pull(after, limit));
        }
        if (path === '/v1/events' && method === 'GET') {
          response.setHeader('content-type', 'text/event-stream');
          response.setHeader('x-accel-buffering', 'no');
          response.writeHead(200);
          const notify = () => {
            if (!owner && !state.peers.some((entry) => entry.id === peer.id)) {
              response.end('event: revoked\ndata: {}\n\n');
            } else if (response.writableLength > 65536) {
              response.destroy();
            } else {
              response.write('data: RESYNC\n\n');
            }
          };
          listeners.add(notify);
          notify();
          const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000);
          response.on('close', () => {
            clearInterval(heartbeat);
            listeners.delete(notify);
          });
          return;
        }
        if (path === '/v1/state' && method === 'GET') {
          return send(snapshot());
        }
        if (path === '/v1/factories' && method === 'POST') {
          const input = factoryInput.parse(await body(request));
          if (!isAbsolute(input.directory)) {
            throw fault(400, 'Enter an absolute folder path on this computer.');
          }
          const { statSync, realpathSync } = await import('node:fs');
          let directory;
          try {
            directory = realpathSync(input.directory);
            if (!statSync(directory).isDirectory()) {
              throw new Error('not a directory');
            }
          } catch {
            throw fault(400, 'That folder does not exist on the selected computer.');
          }
          if (state.factories.some((entry) => entry.directory === directory)) {
            throw fault(409, 'This folder already belongs to a factory.');
          }
          const factory = { id: randomUUID(), name: input.name, directory };
          state.factories.push(factory);
          persist();
          return send(factory, 201);
        }
        if (path === '/v1/agents' && method === 'POST') {
          const input = agentInput.parse(await body(request));
          if (!state.factories.some((entry) => entry.id === input.factoryId)) {
            throw fault(404, 'Factory not found on this computer.');
          }
          const agent = { ...input, id: randomUUID(), enabled: false, nextRunAt: null };
          state.agents.push(agent);
          persist();
          return send(agent, 201);
        }
        const agentRoute = path.match(/^\/v1\/agents\/([a-f0-9-]+)\/(run|schedule)$/);
        if (agentRoute && method === 'POST') {
          const agent = state.agents.find((entry) => entry.id === agentRoute[1]);
          if (!agent) {
            throw fault(404, 'Agent not found.');
          }
          if (agentRoute[2] === 'run') {
            const input = z
              .object({
                prompt: z.string().trim().min(1).max(32000).optional(),
                requestId: z.string().max(200).optional(),
                messageId: z.string().max(200).optional(),
              })
              .parse(await body(request));
            const previous = input.requestId
              ? state.runs.find((run) => run.requestId === input.requestId)
              : null;
            return send(previous ?? enqueue(agent, input), 202);
          }
          const { enabled } = z
            .object({ enabled: z.boolean() })
            .strict()
            .parse(await body(request));
          if (!agent.intervalMinutes) {
            throw fault(400, 'This agent runs manually.');
          }
          if (enabled && !providerReady) {
            throw fault(
              409,
              'Install and sign in to Codex on this computer, then restart the host.',
            );
          }
          agent.enabled = enabled;
          agent.nextRunAt = enabled ? Date.now() + agent.intervalMinutes * 60000 : null;
          persist();
          return send(agent);
        }
        const updateAgent = path.match(/^\/v1\/agents\/([a-f0-9-]+)$/);
        if (updateAgent && method === 'POST') {
          const agent = state.agents.find((entry) => entry.id === updateAgent[1]);
          if (!agent) {
            throw fault(404, 'Agent not found.');
          }
          const input = agentInput.partial().parse(await body(request));
          if (input.factoryId && input.factoryId !== agent.factoryId) {
            throw fault(400, 'Move agents by creating them in the destination factory.');
          }
          Object.assign(agent, input);
          if (agent.intervalMinutes === null) {
            agent.enabled = false;
            agent.nextRunAt = null;
          }
          persist();
          return send(agent);
        }
        const cancelRoute = path.match(/^\/v1\/runs\/([a-f0-9-]+)\/cancel$/);
        if (cancelRoute && method === 'POST') {
          const run = state.runs.find((entry) => entry.id === cancelRoute[1]);
          if (!run) {
            throw fault(404, 'Run not found.');
          }
          if (run.status === 'queued') {
            run.status = 'cancelled';
            run.finishedAt = new Date().toISOString();
            persist();
          } else if (active?.run.id === run.id) {
            stopActive();
          }
          return send({ ok: true });
        }
        if (!owner) {
          throw fault(403, 'Manage pairing and network access on the host computer.');
        }
        if (path === '/v1/pairing' && method === 'POST') {
          const code = String(randomInt(10000000, 100000000));
          pairing = {
            id: randomUUID(),
            digest: hash(code),
            expiresAt: clock() + 5 * 60000,
            attempts: 0,
          };
          return send({
            id: pairing.id,
            code,
            expiresAt: pairing.expiresAt,
            origin: exposedOrigin ?? origin,
          });
        }
        if (path === '/v1/pairing' && method === 'DELETE') {
          const { id } = z.object({ id: z.uuid() }).parse(await body(request));
          if (pairing?.id === id) {
            pairing = null;
          }
          return send({ ok: true });
        }
        if (path === '/v1/network' && method === 'POST') {
          const { address } = z
            .object({ address: z.string() })
            .strict()
            .parse(await body(request));
          exposedOrigin = validateOrigin(address);
          state.address = exposedOrigin;
          persist();
          return send({ address: exposedOrigin });
        }
        const peerRoute = path.match(/^\/v1\/peers\/([a-f0-9-]+)$/);
        if (peerRoute && method === 'DELETE') {
          state.peers = state.peers.filter((entry) => entry.id !== peerRoute[1]);
          persist();
          return send({ ok: true });
        }
        if (path === '/v1/shutdown' && method === 'POST') {
          send({ ok: true });
          setImmediate(() => close());
          return;
        }
        throw fault(404, 'OpenFactory operation not found.');
      } catch (error) {
        send(
          {
            error:
              error instanceof z.ZodError ? 'Check the form values and try again.' : error.message,
          },
          error.status ?? (error instanceof z.ZodError ? 400 : 500),
        );
      }
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 48180, '127.0.0.1', accept);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    save(join(dataDir, 'connection.json'), { origin, pid: process.pid, hostId: state.id });
    const tick = setInterval(() => {
      for (const agent of state.agents) {
        if (agent.enabled && agent.nextRunAt <= Date.now()) {
          agent.nextRunAt = Date.now() + agent.intervalMinutes * 60000;
          persist();
          try {
            enqueue(agent);
          } catch {
            // Busy agents skip the missed interval instead of building a backlog.
          }
        }
      }
    }, 1000);
    async function close() {
      if (closing) {
        return;
      }
      closing = true;
      clearInterval(tick);
      const stopped = active
        ? new Promise((accept) => active.child.once('close', accept))
        : Promise.resolve();
      stopActive();
      const serverClosed = new Promise((accept) => server.close(accept));
      server.closeAllConnections();
      await serverClosed;
      await stopped;
      store.close();
      releaseLock();
    }
    return {
      origin,
      token: ownerToken,
      id: state.id,
      close,
      setAdvertisedOrigin: (value) => {
        exposedOrigin = validateOrigin(value);
      },
    };
  } catch (error) {
    store?.close();
    releaseLock();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureWorkspaceRuntime({
    root: dirname(fileURLToPath(import.meta.url)),
    dataDir: defaultDataDir(),
  });
  const host = await startHost({
    port: Number(process.env.OPENFACTORY_DESKTOP_PORT ?? 48180),
    advertisedOrigin: process.env.OPENFACTORY_DESKTOP_ORIGIN,
  });
  process.stdout.write(`OpenFactory host ready at ${host.origin}\n`);
  process.on('SIGTERM', () => host.close());
  process.on('SIGINT', () => host.close());
}
