import { afterEach, describe, expect, it } from 'vite-plus/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startHost, validateOrigin } from '../src/host.mjs';

const resources = [];
afterEach(async () => {
  for (const resource of resources.splice(0).reverse()) {
    await resource();
  }
});

async function host(overrides = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'openfactory-host-'));
  resources.push(() => rmSync(dataDir, { recursive: true, force: true }));
  const executable = join(dataDir, 'fake codex');
  writeFileSync(
    executable,
    `#!${process.execPath}
if (process.argv.includes('--version')) { process.stdout.write('codex-test 1.0'); process.exit(0); }
let prompt = '';
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', () => {
  if (prompt === 'wait') { setInterval(() => {}, 1000); return; }
  if (prompt === 'fail') { console.log(JSON.stringify({type:'turn.failed',error:{message:'Provider refused'}})); return; }
  if (prompt === 'incomplete') { return; }
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({prompt,cwd:process.cwd(),args:process.argv.slice(2)})}}));
  console.log(JSON.stringify({type:'turn.completed'}));
});
`,
    { mode: 0o700 },
  );
  const options = { dataDir, port: 0, codexExecutable: executable, ...overrides };
  const instance = await startHost(options);
  resources.push(() => instance.close());
  return { ...instance, dataDir, options };
}

async function call(host, path, method = 'GET', value, token = host.token, extraHeaders = {}) {
  const response = await fetch(`${host.origin}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(value === undefined ? {} : { 'content-type': 'application/json' }),
      ...extraHeaders,
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  return { status: response.status, data: await response.json() };
}

async function setupAgent(instance, prompt = 'Summarize this folder', intervalMinutes = null) {
  const factory = await call(instance, '/v1/factories', 'POST', {
    name: 'Test factory',
    directory: instance.dataDir,
  });
  expect(factory.status).toBe(201);
  const agent = await call(instance, '/v1/agents', 'POST', {
    name: 'Reviewer',
    factoryId: factory.data.id,
    prompt,
    intervalMinutes,
  });
  expect(agent.status).toBe(201);
  return agent.data;
}

async function waitForRun(instance, id, expected) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const { data } = await call(instance, '/v1/state');
    const run = data.runs.find((entry) => entry.id === id);
    if (run && expected.includes(run.status)) {
      return run;
    }
    await new Promise((accept) => setTimeout(accept, 40));
  }
  throw new Error('Run did not reach its expected state.');
}

describe('OpenFactory host over real HTTP', () => {
  it('pairs once, persists access, keeps credentials out of state, and revokes the device', async () => {
    const instance = await host();
    expect((await call(instance, '/v1/state', 'GET', undefined, '')).status).toBe(401);
    const pairing = await call(instance, '/v1/pairing', 'POST', {});
    expect(pairing.data.code).toMatch(/^\d{8}$/);
    expect(pairing.data.expiresAt - Date.now()).toBeGreaterThan(290000);
    const grant = await call(
      instance,
      '/v1/pair',
      'POST',
      { code: pairing.data.code, name: 'Laptop' },
      '',
    );
    expect(grant.status).toBe(200);
    expect(
      (await call(instance, '/v1/pair', 'POST', { code: pairing.data.code, name: 'Replay' }, ''))
        .status,
    ).toBe(403);
    const remote = await call(instance, '/v1/state', 'GET', undefined, grant.data.token);
    expect(remote.data.host.id).toBe(instance.id);
    expect(remote.data.peers[0].name).toBe('Laptop');
    expect(JSON.stringify(remote.data)).not.toContain(grant.data.token);
    expect(JSON.stringify(remote.data)).not.toContain('digest');
    expect((await call(instance, '/v1/pairing', 'POST', {}, grant.data.token)).status).toBe(403);
    const persisted = readFileSync(join(instance.dataDir, 'host.sqlite'), 'utf8');
    expect(persisted).not.toContain(grant.data.token);
    await instance.close();
    const restarted = await startHost(instance.options);
    resources.push(() => restarted.close());
    expect(restarted.id).toBe(instance.id);
    expect((await call(restarted, '/v1/state', 'GET', undefined, grant.data.token)).status).toBe(
      200,
    );
    expect((await call(restarted, `/v1/peers/${grant.data.peerId}`, 'DELETE')).status).toBe(200);
    expect((await call(restarted, '/v1/state', 'GET', undefined, grant.data.token)).status).toBe(
      401,
    );
  });

  it('limits guesses and invalidates old or cancelled pairing codes', async () => {
    const instance = await host();
    const first = await call(instance, '/v1/pairing', 'POST', {});
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(
        (await call(instance, '/v1/pair', 'POST', { code: 'wrong', name: 'Guess' }, '')).status,
      ).toBe(403);
    }
    expect(
      (await call(instance, '/v1/pair', 'POST', { code: first.data.code, name: 'Locked out' }, ''))
        .status,
    ).toBe(403);
    const second = await call(instance, '/v1/pairing', 'POST', {});
    expect(
      (await call(instance, '/v1/pair', 'POST', { code: first.data.code, name: 'Old code' }, ''))
        .status,
    ).toBe(403);
    await call(instance, '/v1/pairing', 'DELETE', { id: first.data.id });
    expect(
      (
        await call(
          instance,
          '/v1/pair',
          'POST',
          { code: second.data.code, name: 'New link survives old dialog' },
          '',
        )
      ).status,
    ).toBe(200);
    const third = await call(instance, '/v1/pairing', 'POST', {});
    await call(instance, '/v1/pairing', 'DELETE', { id: third.data.id });
    expect(
      (await call(instance, '/v1/pair', 'POST', { code: third.data.code, name: 'Cancelled' }, ''))
        .status,
    ).toBe(403);
  });

  it('expires pairing and refuses concurrent hosts using the same saved data', async () => {
    let now = Date.now();
    const instance = await host({ clock: () => now });
    const pairing = await call(instance, '/v1/pairing', 'POST', {});
    now += 5 * 60000;
    expect(
      (await call(instance, '/v1/pair', 'POST', { code: pairing.data.code, name: 'Late' }, ''))
        .status,
    ).toBe(403);
    await expect(startHost(instance.options)).rejects.toThrow('already using');
    expect((await call(instance, '/v1/state')).status).toBe(200);
  });

  it('rejects browser requests, invalid folders, and malformed agent settings', async () => {
    const instance = await host();
    expect(
      (
        await call(instance, '/v1/state', 'GET', undefined, instance.token, {
          origin: 'https://attacker.invalid',
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(instance, '/v1/factories', 'POST', { name: 'Bad', directory: '.' })).status,
    ).toBe(400);
    expect(
      (
        await call(instance, '/v1/factories', 'POST', {
          name: 'Bad',
          directory: '/does-not-exist-openfactory',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(instance, '/v1/agents', 'POST', {
          name: 'Bad',
          factoryId: instance.id,
          prompt: 'test',
          sandbox: 'danger-full-access',
        })
      ).status,
    ).toBe(400);
  });

  it('executes a paired device’s agent through the host’s process adapter and persists its real response', async () => {
    const instance = await host();
    const other = await host();
    const agent = await setupAgent(
      instance,
      'Keep $(printf injected) and `literal` as plain instructions',
    );
    const code = (await call(instance, '/v1/pairing', 'POST', {})).data.code;
    const credential = (await call(instance, '/v1/pair', 'POST', { code, name: 'Second host' }, ''))
      .data.token;
    const dispatched = await call(instance, `/v1/agents/${agent.id}/run`, 'POST', {}, credential);
    expect(dispatched.status).toBe(202);
    const run = await waitForRun(instance, dispatched.data.id, ['succeeded']);
    const response = JSON.parse(run.output);
    expect(response.prompt).toBe(agent.prompt);
    expect(response.cwd).toBe(instance.dataDir);
    expect(response.args).toContain('read-only');
    expect((await call(other, '/v1/state')).data.runs).toEqual([]);
    await instance.close();
    const restarted = await startHost(instance.options);
    resources.push(() => restarted.close());
    expect((await call(restarted, '/v1/state')).data.runs[0]).toMatchObject({
      status: 'succeeded',
      output: run.output,
    });
  });

  it.each(['fail', 'incomplete'])(
    'does not call a %s provider response a successful run',
    async (prompt) => {
      const instance = await host();
      const agent = await setupAgent(instance, prompt);
      const dispatched = await call(instance, `/v1/agents/${agent.id}/run`, 'POST', {});
      const run = await waitForRun(instance, dispatched.data.id, ['failed']);
      expect(run.error).toBeTruthy();
    },
  );

  it('queues agents, rejects duplicate dispatch, and cancels the running process', async () => {
    const instance = await host();
    const agent = await setupAgent(instance, 'wait');
    const run = (await call(instance, `/v1/agents/${agent.id}/run`, 'POST', {})).data;
    await waitForRun(instance, run.id, ['running']);
    expect((await call(instance, `/v1/agents/${agent.id}/run`, 'POST', {})).status).toBe(409);
    const second = (
      await call(instance, '/v1/agents', 'POST', {
        factoryId: agent.factoryId,
        name: 'Second',
        prompt: 'Second response',
      })
    ).data;
    const queued = await call(instance, `/v1/agents/${second.id}/run`, 'POST', {});
    expect(queued.data.status).toBe('queued');
    await call(instance, `/v1/runs/${run.id}/cancel`, 'POST', {});
    expect((await waitForRun(instance, run.id, ['cancelled'])).status).toBe('cancelled');
    expect((await waitForRun(instance, queued.data.id, ['succeeded'])).output).toContain(
      'Second response',
    );
  });

  it('keeps schedules paused until enabled and dispatches an overdue interval once after restart', async () => {
    const instance = await host();
    const agent = await setupAgent(instance, 'Scheduled response', 1);
    expect(agent.enabled).toBe(false);
    expect(
      (await call(instance, `/v1/agents/${agent.id}/schedule`, 'POST', { enabled: true })).data
        .nextRunAt,
    ).toBeGreaterThan(Date.now());
    await instance.close();
    const database = new DatabaseSync(join(instance.dataDir, 'host.sqlite'));
    const row = database
      .prepare("SELECT data FROM host_records WHERE kind = 'agents' AND id = ?")
      .get(agent.id);
    const savedAgent = JSON.parse(row.data);
    savedAgent.nextRunAt = Date.now() - 60000;
    database
      .prepare("UPDATE host_records SET data = ? WHERE kind = 'agents' AND id = ?")
      .run(JSON.stringify(savedAgent), agent.id);
    database.close();
    const restarted = await startHost(instance.options);
    resources.push(() => restarted.close());
    await new Promise((accept) => setTimeout(accept, 1300));
    const snapshot = (await call(restarted, '/v1/state')).data;
    expect(snapshot.runs).toHaveLength(1);
    expect((await waitForRun(restarted, snapshot.runs[0].id, ['succeeded'])).output).toContain(
      'Scheduled response',
    );
    expect(snapshot.agents[0].nextRunAt).toBeGreaterThan(Date.now());
    await call(restarted, `/v1/agents/${agent.id}/schedule`, 'POST', { enabled: false });
    expect((await call(restarted, '/v1/state')).data.agents[0].enabled).toBe(false);
  });

  it('requires explicit private endpoints for remote pairing', () => {
    expect(validateOrigin('https://dell.example.ts.net:8445')).toBe(
      'https://dell.example.ts.net:8445',
    );
    expect(validateOrigin('http://127.0.0.1:48180')).toBe('http://127.0.0.1:48180');
    for (const address of [
      'http://public.example',
      'file:///etc/passwd',
      'https://user:password@host.ts.net',
      'https://host.ts.net/other',
      'https://host.ts.net/?token=secret',
    ]) {
      expect(() => validateOrigin(address)).toThrow();
    }
  });
});
