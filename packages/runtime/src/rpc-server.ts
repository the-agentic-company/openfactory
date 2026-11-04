import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { ByteSize, Effect, Exit, Layer, Schema, Scope } from 'effect';
import { HttpIncomingMessage } from 'effect/http';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import { RuntimeRpcs, RemoteRuntimeRpcs, RuntimeError, runtimeProcedures } from './rpc-contracts';
import type { AgentRuntime } from './runtime';

export async function makeRuntimeHandler(runtime: AgentRuntime) {
  const scope = Scope.makeUnsafe();
  function invoke<A>(operation: () => Promise<unknown>, schema: Schema.Decoder<A>) {
    return Effect.tryPromise({
      try: operation,
      catch: (error) =>
        new RuntimeError({ message: error instanceof Error ? error.message : String(error) }),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(schema)),
      Effect.mapError((error) =>
        error instanceof RuntimeError ? error : new RuntimeError({ message: error.message }),
      ),
    );
  }
  const handlers = RuntimeRpcs.toLayer({
    'marketplace.leaderboard': (input) =>
      invoke(
        () => runtime.operations['marketplace.leaderboard'](input),
        runtimeProcedures['marketplace.leaderboard'].successSchema,
      ),
    'marketplace.show': (input) =>
      invoke(
        () => runtime.operations['marketplace.show'](input),
        runtimeProcedures['marketplace.show'].successSchema,
      ),
    'marketplace.add': (input) =>
      invoke(
        () => runtime.operations['marketplace.add'](input),
        runtimeProcedures['marketplace.add'].successSchema,
      ),
    'factory.settings': (input) =>
      invoke(
        () => runtime.operations['factory.settings'](input),
        runtimeProcedures['factory.settings'].successSchema,
      ),
    'definitions.get': (input) =>
      invoke(
        () => runtime.operations['definitions.get'](input),
        runtimeProcedures['definitions.get'].successSchema,
      ),
    'definitions.save': (input) =>
      invoke(
        () => runtime.operations['definitions.save'](input),
        runtimeProcedures['definitions.save'].successSchema,
      ),
    'definitions.migrate': (input) =>
      invoke(
        () => runtime.operations['definitions.migrate'](input),
        runtimeProcedures['definitions.migrate'].successSchema,
      ),
    'runtime.status': (input) =>
      invoke(
        () => runtime.operations['runtime.status'](input),
        runtimeProcedures['runtime.status'].successSchema,
      ),
    'teams.list': (input) =>
      invoke(
        () => runtime.operations['teams.list'](input),
        runtimeProcedures['teams.list'].successSchema,
      ),
    'teams.replace': (input) =>
      invoke(
        () => runtime.operations['teams.replace'](input),
        runtimeProcedures['teams.replace'].successSchema,
      ),
    'teams.run': (input) =>
      invoke(
        () => runtime.operations['teams.run'](input),
        runtimeProcedures['teams.run'].successSchema,
      ),
    'agents.list': (input) =>
      invoke(
        () => runtime.operations['agents.list'](input),
        runtimeProcedures['agents.list'].successSchema,
      ),
    'workspace.snapshot': (input) =>
      invoke(
        () => runtime.operations['workspace.snapshot'](input),
        runtimeProcedures['workspace.snapshot'].successSchema,
      ),
    'projects.delete': (input) =>
      invoke(
        () => runtime.operations['projects.delete'](input),
        runtimeProcedures['projects.delete'].successSchema,
      ),
    'projects.upsert': (input) =>
      invoke(
        () => runtime.operations['projects.upsert'](input),
        runtimeProcedures['projects.upsert'].successSchema,
      ),
    'agents.upsert': (input) =>
      invoke(
        () => runtime.operations['agents.upsert'](input),
        runtimeProcedures['agents.upsert'].successSchema,
      ),
    'agents.setEnabled': (input) =>
      invoke(
        () => runtime.operations['agents.setEnabled'](input),
        runtimeProcedures['agents.setEnabled'].successSchema,
      ),
    'agents.run': (input) =>
      invoke(
        () => runtime.operations['agents.run'](input),
        runtimeProcedures['agents.run'].successSchema,
      ),
    'agents.deliveries': (input) =>
      invoke(
        () => runtime.operations['agents.deliveries'](input),
        runtimeProcedures['agents.deliveries'].successSchema,
      ),
    'agents.webhookSecret': (input) =>
      invoke(
        () => runtime.operations['agents.webhookSecret'](input),
        runtimeProcedures['agents.webhookSecret'].successSchema,
      ),
    'sessions.read': (input) =>
      invoke(
        () => runtime.operations['sessions.read'](input),
        runtimeProcedures['sessions.read'].successSchema,
      ),
    'sessions.projection': (input) =>
      invoke(
        () => runtime.operations['sessions.projection'](input),
        runtimeProcedures['sessions.projection'].successSchema,
      ),
    'sessions.send': (input) =>
      invoke(
        () => runtime.operations['sessions.send'](input),
        runtimeProcedures['sessions.send'].successSchema,
      ),
    'sessions.stop': (input) =>
      invoke(
        () => runtime.operations['sessions.stop'](input),
        runtimeProcedures['sessions.stop'].successSchema,
      ),
    'migration.import': (input) =>
      invoke(
        () => runtime.operations['migration.import'](input),
        runtimeProcedures['migration.import'].successSchema,
      ),
    'webhooks.receive': (input) =>
      invoke(
        () => runtime.operations['webhooks.receive'](input),
        runtimeProcedures['webhooks.receive'].successSchema,
      ),
  });
  try {
    const context = await Layer.build(Layer.mergeAll(handlers, RpcSerialization.layerJson)).pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.runPromise,
    );
    return await Effect.gen(function* () {
      const local = yield* RpcServer.toHttpEffect(RuntimeRpcs);
      const remote = yield* RpcServer.toHttpEffect(RemoteRuntimeRpcs);
      const localHandler = yield* NodeHttpServer.makeHandler(local, { scope });
      const remoteHandler = yield* NodeHttpServer.makeHandler(remote, { scope });
      return {
        local: localHandler,
        remote: remoteHandler,
        close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
      };
    }).pipe(
      Effect.provide(context),
      Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(100_000_000)),
      Effect.provideService(Scope.Scope, scope),
      Effect.runPromise,
    );
  } catch (error) {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    throw error;
  }
}
