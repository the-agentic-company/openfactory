import { runtimeRpc as callRuntime, type RuntimeConnection } from '@openfactory/runtime/client';
import type { RuntimeMethod, RuntimePayload } from '@openfactory/runtime/rpc';
import { nativeConnection } from './native-runtime.server';

export async function runtimeRpc<const Method extends RuntimeMethod>(
  method: Method,
  payload: RuntimePayload<Method>,
) {
  const connection: RuntimeConnection | null = await nativeConnection();
  return callRuntime(method, payload, connection ?? undefined);
}
