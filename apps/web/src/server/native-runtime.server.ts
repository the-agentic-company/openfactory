import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const nativeAgent = z.object({
  id: z.string(),
  factoryId: z.string(),
  name: z.string(),
  prompt: z.string(),
  sandbox: z.enum(['read-only', 'workspace-write']),
  intervalMinutes: z.number().nullable(),
  enabled: z.boolean(),
  nextRunAt: z.number().nullable(),
});
const nativeRun = z.object({
  messageId: z.string().optional(),
  id: z.string(),
  agentId: z.string(),
  factoryId: z.string(),
  agentName: z.string(),
  prompt: z.string(),
  output: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export const nativeStateSchema = z.object({
  host: z.object({ id: z.string(), name: z.string() }),
  factories: z.array(z.object({ id: z.string(), name: z.string(), directory: z.string() })),
  agents: z.array(nativeAgent),
  runs: z.array(nativeRun),
  peers: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.string() })),
  address: z.string().nullable(),
  provider: z.object({ name: z.string(), ready: z.boolean() }),
});
export type NativeConnection = { origin: string; token: string };
export const connectionPreferencesPath = () =>
  process.env.OPENFACTORY_CONNECTIONS_FILE ??
  join(
    process.env.OPENFACTORY_SETTINGS_DIR ?? join(homedir(), '.config/openfactory/workspace'),
    'connections.json',
  );
export const connectionPreferencesSchema = z.object({
  activeId: z.string().nullable(),
  computers: z.array(
    z.object({ id: z.string(), name: z.string(), origin: z.string(), token: z.string() }),
  ),
});
export async function connectionPreferences() {
  try {
    return connectionPreferencesSchema.parse(
      JSON.parse(await readFile(connectionPreferencesPath(), 'utf8')),
    );
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { activeId: null, computers: [] };
    }
    throw error;
  }
}
export async function localNativeConnection(): Promise<NativeConnection> {
  const directory =
    process.env.OPENFACTORY_DESKTOP_HOME ??
    join(homedir(), '.local/share/openfactory-desktop-prototype');
  const connection = z
    .object({ origin: z.string() })
    .parse(JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')));
  return {
    origin: connection.origin,
    token: (await readFile(join(directory, 'owner-token'), 'utf8')).trim(),
  };
}
export async function nativeConnection(): Promise<NativeConnection | null> {
  if (process.env.OPENFACTORY_RUNTIME_ORIGIN && process.env.OPENFACTORY_RUNTIME_TOKEN) {
    return {
      origin: process.env.OPENFACTORY_RUNTIME_ORIGIN,
      token: process.env.OPENFACTORY_RUNTIME_TOKEN,
    };
  }
  const preferences = await connectionPreferences();
  if (preferences.activeId === 'local') {
    return localNativeConnection();
  }
  return preferences.computers.find((computer) => computer.id === preferences.activeId) ?? null;
}
export async function nativeRequest(
  connection: NativeConnection,
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<unknown> {
  const response = await fetch(`${connection.origin}${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      authorization: `Bearer ${connection.token}`,
      ...(data === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    throw new Error(z.object({ error: z.string() }).parse(result).error);
  }
  return result;
}
export async function nativeState(connection: NativeConnection) {
  return nativeStateSchema.parse(await nativeRequest(connection, '/v1/state'));
}
