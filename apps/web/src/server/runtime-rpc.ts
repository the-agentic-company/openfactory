import { runtimeRpc as localRuntimeRpc } from '@openfactory/runtime/client';
import { z } from 'zod';
import { nativeConnection, nativeRequest } from './native-runtime.server';

// Paired desktop hosts keep their existing transport; the default host uses the owned runtime.
export async function runtimeRpc(method: string, payload: unknown): Promise<unknown> {
  const native = await nativeConnection();
  if (!native) {
    return localRuntimeRpc(method, payload);
  }
  return z
    .object({ value: z.unknown() })
    .parse(await nativeRequest(native, '/v1/rpc', 'POST', { method, payload })).value;
}
