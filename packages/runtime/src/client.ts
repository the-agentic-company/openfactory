export { groupFactoryInstances } from '@openfactory/protocol/factory-identity';
import { createRuntimeClient, remoteRuntimeLayer } from '@openfactory/client';
export type { RuntimeConnection } from '@openfactory/client';
export { readFactoryOverview, factoryOverviewInputSchema } from '@openfactory/client';
import type { RuntimeConnection } from '@openfactory/client';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient';
import { Cause, Effect, Layer } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { RuntimeRpcs, type RuntimeMethod, type RuntimePayload } from './rpc-contracts';

export function runtimeDirectory() {
  return process.env.OPENFACTORY_RUNTIME_DIR ?? join(homedir(), '.config/openfactory/runtime');
}
export function runtimeSocketPath(directory = runtimeDirectory(), platform = process.platform) {
  return platform === 'win32'
    ? `\\\\.\\pipe\\openfactory-${createHash('sha256').update(resolve(directory)).digest('hex')}`
    : join(directory, 'runtime.sock');
}

export function runtimeClientLayer(connection?: RuntimeConnection) {
  if (connection) {
    return remoteRuntimeLayer(connection);
  }
  return RpcClient.layerProtocolHttp({ url: 'http://localhost/rpc' }).pipe(
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(NodeHttpClient.layerNodeHttpOptions({ socketPath: runtimeSocketPath() })),
  );
}

export async function runtimeRpc<const Method extends RuntimeMethod>(
  method: Method,
  payload: RuntimePayload<Method>,
  connection?: RuntimeConnection,
): Promise<unknown> {
  if (connection) {
    return createRuntimeClient(connection).call(method, payload);
  }
  const exit = await Effect.gen(function* () {
    const client = yield* RpcClient.make(RuntimeRpcs, { flatten: true });
    return yield* client(method, payload);
  }).pipe(
    Effect.provide(runtimeClientLayer(connection)),
    Effect.scoped,
    Effect.timeout(method.startsWith('marketplace.') ? '60 seconds' : '15 seconds'),
    Effect.runPromiseExit,
  );
  if (exit._tag === 'Failure') {
    const error = Cause.squash(exit.cause);
    throw error instanceof Error ? error : new Error(String(error));
  }
  return exit.value;
}
