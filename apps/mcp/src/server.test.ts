import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { readReportingHistory } from '@openfactory/runtime/reporting';
import { reportRuns } from './report';
import { createOpenFactoryMcpServer } from './server';

let directory: string;
const now = new Date('2026-11-06T12:00:00Z');
const agent = {
  id: 'agent',
  projectId: 'factory',
  title: 'Test agent',
  prompt: 'private prompt',
  enabled: false,
  schedule: { type: 'manual' },
  threadId: null,
  modelSelection: { instanceId: 'codex', model: 'test' },
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: 'never',
  lastRunError: null,
  runCount: 0,
};
function run(id: string, requestedAt: string, status = 'completed') {
  return {
    id,
    ordinal: 1,
    userMessageId: `message:${id}`,
    agentId: 'agent',
    threadId: `thread:${id}`,
    requestedAt,
    startedAt: requestedAt,
    completedAt: requestedAt,
    status,
  };
}
function write(table: 'projects' | 'agents' | 'runs' | 'archives', id: string, data: unknown) {
  const db = new DatabaseSync(join(directory, 'runtime.sqlite'));
  try {
    db.prepare(`INSERT OR REPLACE INTO ${table} VALUES (?, ?)`).run(id, JSON.stringify(data));
  } finally {
    db.close();
  }
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  directory = mkdtempSync(join(tmpdir(), 'openfactory-mcp-'));
  vi.stubEnv('OPENFACTORY_DESKTOP_HOME', directory);
  const db = new DatabaseSync(join(directory, 'runtime.sqlite'));
  for (const table of ['projects', 'agents', 'runs', 'archives']) {
    db.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  }
  db.close();
  write('projects', 'factory', { id: 'factory', title: 'Factory', workspaceRoot: '/factory' });
  write('agents', 'agent', agent);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

it('counts every run beyond UI sampling limits and paginates without changing totals', () => {
  const db = new DatabaseSync(join(directory, 'runtime.sqlite'));
  db.exec('BEGIN');
  const insert = db.prepare('INSERT INTO runs VALUES (?, ?)');
  for (let index = 0; index < 351; index++) {
    insert.run(
      String(index),
      JSON.stringify(
        run(String(index), '2026-11-03T10:00:00Z', index === 0 ? 'failed' : 'completed'),
      ),
    );
  }
  db.exec('COMMIT');
  db.close();
  const history = readReportingHistory(directory);
  const first = reportRuns(history, { project: '/factory', limit: 100 }, now);
  const next = reportRuns(history, { offset: 100, limit: 100 }, now);
  expect(first).toMatchObject({
    total: 351,
    sinceDay: '2026-11-02',
    untilDay: '2026-11-09',
    nextOffset: 100,
    byStatus: { completed: 350, failed: 1 },
  });
  expect(first.runs).toHaveLength(100);
  expect(next.total).toBe(351);
  expect(next.runs.some((item) => first.runs.some((other) => other.id === item.id))).toBe(false);
  expect(first.byFactory).toEqual([{ projectId: 'factory', title: 'Factory', total: 351 }]);
  expect(() => reportRuns(history, { project: 'missing' }, now)).toThrow('Unknown factory');
});

it('uses local Monday boundaries, handles the DST week, and deduplicates imported history', () => {
  const before = run('before', '2026-10-25T22:59:59Z');
  const boundary = run('boundary', '2026-10-25T23:00:00Z');
  const end = run('end', '2026-11-01T23:00:00Z');
  const dstWeek = run('dst', '2026-10-18T22:00:00Z');
  write('runs', 'boundary', boundary);
  write('runs', 'end', end);
  write('archives', 'archive', {
    thread: { id: 'archive', title: 'Imported', projectId: 'factory' },
    runs: [before, boundary, dstWeek],
    messages: [before, boundary, dstWeek].map((item) => ({
      id: item.userMessageId,
      runId: item.id,
      scheduledTaskId: 'agent',
      role: 'user',
      text: 'private text',
      createdAt: item.requestedAt,
    })),
  });
  const history = readReportingHistory(directory);
  expect(reportRuns(history, { period: { type: 'last_week' } }, now)).toMatchObject({
    total: 1,
    sinceDay: '2026-10-26',
    untilDay: '2026-11-02',
    runs: [{ id: 'boundary', source: 'openfactory' }],
  });
  expect(
    reportRuns(
      history,
      { period: { type: 'custom', sinceDay: '2026-10-19', untilDay: '2026-10-26' } },
      now,
    ).total,
  ).toBe(2);
  expect(() =>
    reportRuns(
      history,
      { period: { type: 'custom', sinceDay: '2026-11-02', untilDay: '2026-11-02' } },
      now,
    ),
  ).toThrow('exclusive');
  expect(() => reportRuns(history, { timeZone: 'invalid' }, now)).toThrow('IANA');
});

it('exposes read-only tools and serves actual MCP initialization, discovery and a run report', async () => {
  write('runs', 'recent', run('recent', new Date().toISOString()));
  const server = await createOpenFactoryMcpServer(directory, 8022);
  const handler = await server.getHandler();
  async function rpc(method: string, params: unknown) {
    const response = await handler(
      new Request('http://127.0.0.1:8022/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: '127.0.0.1:8022',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    return JSON.parse(
      body.startsWith('event:') || body.startsWith('data:')
        ? (body
            .split('\n')
            .find((line) => line.startsWith('data: '))
            ?.slice(6) ?? '')
        : body,
    );
  }
  try {
    const initialized = z
      .object({ result: z.object({ serverInfo: z.object({ name: z.string() }) }) })
      .parse(
        await rpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        }),
      );
    expect(initialized.result.serverInfo.name).toBe('openfactory');
    const tools = z
      .object({
        result: z.object({
          tools: z.array(
            z.object({ name: z.string(), annotations: z.object({ readOnlyHint: z.boolean() }) }),
          ),
        }),
      })
      .parse(await rpc('tools/list', {}));
    expect(tools.result.tools.map((tool) => tool.name).sort()).toEqual([
      'list_agents',
      'list_factories',
      'list_machines',
      'report_runs',
    ]);
    expect(tools.result.tools.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
    const result = z
      .object({
        result: z.object({
          structuredContent: z.object({
            total: z.number(),
            runs: z.array(z.object({ id: z.string() })),
          }),
        }),
      })
      .parse(await rpc('tools/call', { name: 'report_runs', arguments: {} }));
    expect(result.result.structuredContent).toMatchObject({ total: 1, runs: [{ id: 'recent' }] });
    expect(JSON.stringify(result)).not.toContain('private prompt');
  } finally {
    await server.close();
  }
}, 30000);

it('reads paired runners, deduplicates across machines, filters Dell and marks missing runners incomplete', async () => {
  const { reportFleet } = await import('./fleet');
  const { listMachines } = await import('./machines');
  const timestamp = new Date().toISOString();
  write('runs', 'shared', run('shared', timestamp));
  writeFileSync(
    join(directory, 'computers.json'),
    JSON.stringify([
      {
        id: 'dell',
        hostId: 'dell-host',
        name: 'dell-server',
        origin: 'https://dell.example',
        secret: 'never-return-this',
        encrypted: true,
      },
    ]),
  );
  const gateway = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
    }
    const query = z
      .object({ method: z.string(), payload: z.object({ threadId: z.string().optional() }) })
      .parse(JSON.parse(body));
    const results: Record<string, unknown> = {
      identity: { id: 'dell-host' },
      'runtime.status': { owner: 'openfactory', directory: '/dell', agents: 1, active: 0 },
      'workspace.snapshot': {
        snapshot: {
          projects: [{ id: 'factory', title: 'Dell factory', workspaceRoot: '/dell' }],
          threads: Array.from({ length: 35 }, (_, index) => ({
            id: `remote-thread-${index}`,
            projectId: 'factory',
          })),
        },
      },
      'agents.list': { tasks: [agent] },
      'sessions.read': {
        projection: {
          thread: { id: 'remote-thread', title: 'Remote', runtime: 'openfactory' },
          runs: [run('shared', timestamp), run(`remote-only:${query.payload.threadId}`, timestamp)],
          messages: [],
        },
      },
    };
    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify(results[query.method]));
  });
  await new Promise<void>((resolve) => gateway.listen(join(directory, 'reporting.sock'), resolve));
  try {
    const machines = await listMachines(directory);
    expect(machines.machines).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'dell', status: 'online' })]),
    );
    expect(JSON.stringify(machines)).not.toContain('never-return-this');
    const all = await reportFleet(directory, {});
    expect(all).toMatchObject({ total: 36, knownTotal: 36, complete: true });
    expect(all.byMachine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ machineId: 'local', total: 1 }),
        expect.objectContaining({ machineId: 'dell', total: 36 }),
      ]),
    );
    expect(await reportFleet(directory, { machine: 'dell' })).toMatchObject({
      total: 36,
      complete: true,
    });
    expect(await reportFleet(directory, { project: '/dell' })).toMatchObject({ total: 36 });
    await expect(reportFleet(directory, { machine: 'unknown' })).rejects.toThrow('Unknown machine');
  } finally {
    await new Promise<void>((resolve, reject) =>
      gateway.close((error) => (error ? reject(error) : resolve())),
    );
  }
  expect(await reportFleet(directory, {})).toMatchObject({
    complete: false,
    total: null,
    knownTotal: 1,
  });
  expect((await listMachines(directory)).machines).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'dell', status: 'unavailable' })]),
  );
});
