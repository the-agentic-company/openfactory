import { reportingSocketPath } from '../../desktop/src/reporting-socket.mjs';
import { readFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { z } from 'zod';
import { agentSchema, threadHistorySchema } from '@openfactory/core';
import { readReportingHistory, reportingHistorySchema } from '@openfactory/runtime/reporting';

const machineSchema = z.object({
  id: z.string(),
  name: z.string(),
  origin: z.string(),
  hostId: z.string().optional(),
});
export type Machine = z.infer<typeof machineSchema>;
const desktopDirectory = () =>
  process.env.OPENFACTORY_DESKTOP_HOME ??
  join(homedir(), '.local/share/openfactory-desktop-prototype');

export async function pairedMachines() {
  try {
    return z
      .array(machineSchema)
      .parse(JSON.parse(await readFile(join(desktopDirectory(), 'computers.json'), 'utf8')));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function desktopRead(
  computerId: string,
  method: string,
  payload: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: reportingSocketPath(desktopDirectory()),
        path: '/read',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            const value: unknown = JSON.parse(body);
            if (response.statusCode !== 200) {
              reject(new Error(z.object({ error: z.string() }).parse(value).error));
            } else {
              resolve(value);
            }
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Runner read timed out.')));
    req.end(JSON.stringify({ computerId, method, payload }));
  });
}
export async function verifyMachine(machine: Machine) {
  const identity = z
    .object({ id: z.string() })
    .parse(await desktopRead(machine.id, 'identity', {}));
  if (machine.hostId && identity.id !== machine.hostId) {
    throw new Error('Runner identity changed. Pair this computer again.');
  }
}
export async function listMachines(directory: string) {
  const remotes = await pairedMachines();
  const machines = await Promise.all(
    remotes.map(async (machine) => {
      try {
        await verifyMachine(machine);
        return { ...machine, local: false, status: 'online', error: null };
      } catch (error) {
        return {
          ...machine,
          local: false,
          status: 'unavailable',
          error: error instanceof Error ? error.message : 'Runner unavailable.',
        };
      }
    }),
  );
  let localError: string | null = null;
  try {
    readReportingHistory(directory);
  } catch (error) {
    localError = error instanceof Error ? error.message : 'Local history unavailable.';
  }
  return {
    machines: [
      {
        id: 'local',
        name: hostname(),
        origin: null,
        local: true,
        status: localError ? 'unavailable' : 'online',
        error: localError,
      },
      ...machines,
    ],
  };
}

export async function readMachineHistory(machine: Machine) {
  await verifyMachine(machine);
  const [workspace, tasks] = await Promise.all([
    desktopRead(machine.id, 'workspace.snapshot', {}),
    desktopRead(machine.id, 'agents.list', {}),
  ]);
  const { snapshot } = z
    .object({
      snapshot: z.object({
        projects: reportingHistorySchema.shape.projects,
        threads: z.array(z.object({ id: z.string(), projectId: z.string() })),
      }),
    })
    .parse(workspace);
  const { tasks: agents } = z.object({ tasks: z.array(agentSchema) }).parse(tasks);
  const runs = new Map<string, z.infer<typeof reportingHistorySchema>['runs'][number]>();
  const threads = [...new Map(snapshot.threads.map((thread) => [thread.id, thread])).values()];
  for (let offset = 0; offset < threads.length; offset += 5) {
    const projections = await Promise.all(
      threads.slice(offset, offset + 5).map(async (thread) => {
        const { projection } = z
          .object({
            projection: threadHistorySchema.extend({
              runs: z.array(
                threadHistorySchema.shape.runs.element.extend({ agentId: z.string().optional() }),
              ),
            }),
          })
          .parse(await desktopRead(machine.id, 'sessions.read', { threadId: thread.id }));
        return { thread, projection };
      }),
    );
    for (const { thread, projection } of projections) {
      for (const run of projection.runs) {
        const trigger = projection.messages.find((message) => message.id === run.userMessageId);
        const agentId = run.agentId ?? trigger?.scheduledTaskId;
        if (!agentId) {
          continue;
        }
        runs.set(run.id, {
          ...run,
          agentId,
          threadId: thread.id,
          projectId: thread.projectId,
          source: projection.thread.runtime === 'openfactory' ? 'openfactory' : 'imported',
        });
      }
    }
  }
  return reportingHistorySchema.parse({
    projects: snapshot.projects,
    agents,
    runs: [...runs.values()],
  });
}
