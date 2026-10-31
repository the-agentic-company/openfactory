// One-time cutover. T3 is never contacted by the normal local runtime.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { runtimeRpc, runtimeDirectory } from '../../../packages/runtime/src/client.ts';
import { nextScheduledAt } from '../../../packages/runtime/src/schedule.ts';

const directory = join(runtimeDirectory(), 'migration-t3');
await mkdir(directory, { recursive: true, mode: 0o700 });
async function load(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return null;
  }
}
async function save(path, value) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, path);
}
const cutoverPath = join(directory, 'cutover.json');
const cutover = (await load(cutoverPath)) ?? { disabled: [], enabled: [], finishedAt: null };
if (cutover.finishedAt) {
  console.log(
    `Migration already completed at ${cutover.finishedAt}. Current OpenFactory settings were preserved.`,
  );
  process.exit(0);
}
const token = (
  process.env.T3_TOKEN ??
  (await readFile(
    process.env.T3_TOKEN_FILE ?? join(homedir(), '.config/openfactory/t3-token'),
    'utf8',
  ))
).trim();
function t3(method, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(
      '/ws?orchestrationProtocol=2',
      process.env.T3_ORIGIN ?? 'http://127.0.0.1:3773',
    );
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
    const timer = setTimeout(() => finish(new Error('T3 migration request timed out.')), 15000);
    let settled = false;
    function finish(error, value) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }
    socket.on('open', () =>
      socket.send(JSON.stringify({ _tag: 'Request', id: '1', tag: method, payload, headers: [] })),
    );
    socket.on('error', (error) => finish(error));
    socket.on('close', () => finish(new Error('T3 closed the migration connection.')));
    socket.on('message', (source) => {
      try {
        const bytes = Array.isArray(source)
          ? Buffer.concat(source)
          : Buffer.isBuffer(source)
            ? source
            : Buffer.from(source);
        const message = JSON.parse(bytes.toString('utf8'));
        if (message._tag === 'Ping') {
          socket.send(JSON.stringify({ _tag: 'Pong' }));
          return;
        }
        if (message._tag === 'Chunk' && message.requestId === '1') {
          finish(null, message.values[0]);
          return;
        }
        if (message._tag === 'Exit' && message.requestId === '1') {
          if (message.exit._tag === 'Success') {
            finish(null, message.exit.value);
          } else {
            finish(new Error('T3 rejected the migration request.'));
          }
        }
      } catch (error) {
        finish(error);
      }
    });
  });
}
async function capture() {
  const [tasks, shell] = await Promise.all([
    t3('scheduledTasks.list', {}),
    t3('orchestration.subscribeShell', {}),
  ]);
  const candidates = shell.snapshot.threads.filter((thread) =>
    tasks.tasks.some(
      (agent) =>
        agent.threadId === thread.id ||
        (agent.projectId === thread.projectId && agent.title === thread.title),
    ),
  );
  const histories = [];
  for (const thread of candidates) {
    const { projection } = await t3('orchestration.subscribeThread', {
      threadId: thread.id,
      acceptBoundedSnapshot: false,
    });
    histories.push(projection);
  }
  return {
    createdAt: new Date().toISOString(),
    projects: shell.snapshot.projects,
    agents: tasks.tasks,
    histories,
  };
}
const snapshotPath = join(directory, 'snapshot.json');
let snapshot = await load(snapshotPath);
if (!snapshot) {
  snapshot = await capture();
  await save(snapshotPath, snapshot);
}
console.log(
  `Backup: ${snapshot.agents.length} agents, ${snapshot.histories.length} conversations. ${snapshotPath}`,
);
if (!process.argv.includes('--apply')) {
  console.log('No schedules changed. Run pnpm runtime:migrate --apply to cut over.');
  process.exit(0);
}
// A dry-run backup is not authoritative at cutover time. Keep a fresh, resumable source.
const sourcePath = join(directory, 'cutover-source.json');
let source = await load(sourcePath);
if (!source) {
  source = await capture();
  await save(sourcePath, source);
}
// Validate/import before changing T3. New imports start paused; retries preserve local edits.
await runtimeRpc('migration.import', { ...source, histories: [] });
for (const agent of source.agents) {
  if (cutover.disabled.includes(agent.id)) {
    continue;
  }
  const { task: paused } = await t3('scheduledTasks.setEnabled', { id: agent.id, enabled: false });
  // If this occurrence fired during export, never dispatch it again under the new owner.
  if (
    agent.nextRunAt &&
    paused.lastRunAt &&
    new Date(paused.lastRunAt) >= new Date(agent.nextRunAt)
  ) {
    agent.nextRunAt = nextScheduledAt(agent.schedule, new Date(paused.lastRunAt));
  }
  await save(sourcePath, source);
  cutover.disabled.push(agent.id);
  await save(cutoverPath, cutover);
}
// Refresh histories only after the old scheduler is paused and every turn has finished.
const drained = await capture();
if (
  drained.histories.some((projection) =>
    projection.runs.some((run) =>
      ['queued', 'preparing', 'starting', 'running', 'waiting'].includes(run.status),
    ),
  )
) {
  throw new Error(
    'T3 still has an active turn. Its schedules are paused. Rerun this migration after the turn finishes; the new owner has not been enabled.',
  );
}
const finalHistories = [
  ...new Map(
    [...source.histories, ...drained.histories].map((projection) => [
      projection.thread.id,
      projection,
    ]),
  ).values(),
];
await save(join(directory, 'history-final.json'), finalHistories);
await runtimeRpc('migration.import', { ...source, histories: finalHistories });
for (const agent of source.agents) {
  if (agent.enabled && !cutover.enabled.includes(agent.id)) {
    await runtimeRpc('agents.setEnabled', {
      id: agent.id,
      enabled: true,
      nextRunAt: agent.nextRunAt,
    });
    cutover.enabled.push(agent.id);
    await save(cutoverPath, cutover);
  }
}
cutover.finishedAt = new Date().toISOString();
await save(cutoverPath, cutover);
console.log(
  `Cutover complete. T3 schedules paused; OpenFactory owns ${source.agents.length} agents. Receipt: ${cutoverPath}`,
);
