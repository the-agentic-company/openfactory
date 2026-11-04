import { cachedRead } from './read-cache.server';
import { runtimeRpc as callRuntime, type RuntimeConnection } from '@openfactory/runtime/client';
import type { RuntimeMethod, RuntimePayload } from '@openfactory/runtime/rpc';
import { nativeConnection } from './native-runtime.server';

export async function runtimeRpc<const Method extends RuntimeMethod>(
  method: Method,
  payload: RuntimePayload<Method>,
) {
  const connection: RuntimeConnection | null = await nativeConnection();
  return (await runtimeRead(method, payload, connection)).value;
}

const reads = new Set<RuntimeMethod>([
  'history.agent',
  'agents.list',
  'workspace.snapshot',
  'sessions.read',
  'sessions.projection',
  'definitions.get',
  'teams.list',
  'agents.deliveries',
  'usage.agent',
  'usage.factory',
  'pullRequests.list',
]);
export async function runtimeRead<const Method extends RuntimeMethod>(
  method: Method,
  payload: RuntimePayload<Method>,
  connection: RuntimeConnection | null = null,
) {
  const target = connection ?? (await nativeConnection());
  const read = () => callRuntime(method, payload, target ?? undefined);
  const cacheable =
    reads.has(method) ||
    (method === 'factory.settings' && 'operation' in payload && payload.operation === 'read');
  if (!cacheable) {
    return { value: await read(), offline: false, savedAt: new Date().toISOString() };
  }
  return cachedRead(
    JSON.stringify([target?.origin ?? 'local', target?.token ?? '', method, payload]),
    read,
  );
}
