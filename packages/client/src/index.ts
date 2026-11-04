import { Cause, Effect, Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { RpcClient, RpcSerialization, RpcClientError } from 'effect/rpc';
import { z } from 'zod';
import {
  RuntimeRpcs,
  runtimeInputs,
  runtimeResults,
  type RuntimeMethod,
  type RuntimePayload,
} from '@openfactory/protocol';

export const hostOriginSchema = z
  .string()
  .trim()
  .transform((input, context) => {
    try {
      const url = new URL(input);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== '/'
      ) {
        throw new Error('invalid origin');
      }
      return url.origin;
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Enter a computer address such as https://computer.example.ts.net:8445.',
      });
      return z.NEVER;
    }
  });
export const connectionSchema = z.object({
  origin: hostOriginSchema,
  token: z.string().min(32),
});
export type RuntimeConnection = z.infer<typeof connectionSchema>;
export type RuntimeResult<M extends RuntimeMethod> = z.output<(typeof runtimeResults)[M]>;

export function remoteRuntimeLayer(input: RuntimeConnection) {
  const connection = connectionSchema.parse(input);
  return RpcClient.layerProtocolHttp({
    url: `${connection.origin}/v1/rpc`,
    transformClient: (client) =>
      HttpClient.transformResponse(
        HttpClient.mapRequest(client, HttpClientRequest.bearerToken(connection.token)),
        Effect.flatMap((response) =>
          response.status >= 200 && response.status < 300
            ? Effect.succeed(response)
            : Effect.die(
                new Error(
                  `HTTP ${response.status}: Factory access failed. If host status works, update OpenFactory on that computer to the same version and restart it.`,
                ),
              ),
        ),
      ),
  }).pipe(Layer.provide(RpcSerialization.layerJson), Layer.provide(FetchHttpClient.layer));
}

export function createRuntimeClient(connection: RuntimeConnection) {
  const layer = remoteRuntimeLayer(connection);
  return {
    async call<const M extends RuntimeMethod>(
      this: void,
      method: M,
      input: RuntimePayload<M>,
    ): Promise<RuntimeResult<M>> {
      runtimeInputs[method].parse(input);
      const exit = await Effect.gen(function* () {
        const client = yield* RpcClient.make(RuntimeRpcs, { flatten: true });
        return yield* client(method === 'factory.machine' ? 'factory.runner' : method, input);
      }).pipe(
        Effect.provide(layer),
        Effect.scoped,
        Effect.timeout(method.startsWith('marketplace.') ? '60 seconds' : '15 seconds'),
        Effect.runPromiseExit,
      );
      if (exit._tag === 'Failure') {
        const error = Cause.squash(exit.cause);
        if (
          error instanceof RpcClientError.RpcClientError &&
          error.reason._tag === 'HttpError' &&
          error.reason.kind === 'TransportError'
        ) {
          const transport = z.object({ cause: z.instanceof(Error) }).safeParse(error.reason.cause);
          if (transport.success) {
            const cause = transport.data.cause;
            const detail = cause.cause instanceof Error ? cause.cause.message : cause.message;
            throw new Error(`Cannot reach OpenFactory: ${detail}`, { cause });
          }
        }
        throw error instanceof Error ? error : new Error(String(error));
      }
      return runtimeResults[method].parse(exit.value) as RuntimeResult<M>;
    },
  };
}
export type RuntimeClient = ReturnType<typeof createRuntimeClient>;

const pairedHostSchema = z.object({
  host: z.object({ id: z.string(), name: z.string() }),
  token: connectionSchema.shape.token,
  peerId: z.string(),
});
export const savedComputerSchema = connectionSchema.extend({
  name: z.string(),
  hostId: z.string(),
});
export type SavedComputer = z.infer<typeof savedComputerSchema>;

export async function pairComputer(input: {
  origin: string;
  code: string;
  name: string;
}): Promise<SavedComputer> {
  const origin = hostOriginSchema.parse(input.origin);
  const response = await fetch(`${origin}/v1/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: input.code.trim(), name: input.name }),
    signal: AbortSignal.timeout(15000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new Error(error.success ? error.data.error : `Pairing failed (${response.status}).`);
  }
  const paired = pairedHostSchema.parse(body);
  return { origin, token: paired.token, name: paired.host.name, hostId: paired.host.id };
}

export { readFactoryRuns, type RuntimeCall } from './history';
export { agentUpdateFromDefinition, createTeamFiles } from './definitions';
export { readAgent, readAgentProjections } from './agent-history';
export { readRunDetail } from './run-detail';
export { readFactoryOverview, factoryOverviewInputSchema, factoryOverviewSchema } from './overview';
