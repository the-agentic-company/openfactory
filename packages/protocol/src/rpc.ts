import { migrateMachineAssignment } from './legacy-machine';
import { appStatementsSchema, appPromptSchema } from './app-bridge';
import { Effect, Schema, SchemaIssue } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import {
  agentSchema,
  agentRunSchema,
  pullRequestResultSchema,
  agentAppearanceSchema,
  deliverySchema,
  marketplaceKindSchema,
  marketplaceSelectionSchema,
  marketplaceListingSchema,
  marketplacePreviewSchema,
  resolvedTeamSchema,
  scorerSchema,
  teamSetupSchema,
  threadHistorySchema,
} from '@openfactory/core';
import { z } from 'zod';
import { importSchema, projectSchema, sendSchema, upsertSchema } from './contracts';
import { definitionFilesSchema, savedDefinitionSchema } from './definitions';
import { factoryProfileSchema, factorySettingsInputSchema } from './settings';

// Reuse the domain validators while Effect owns the RPC protocol and serialization.
function payload<S extends z.ZodType>(schema: S) {
  return Schema.declare<z.input<S>>(
    (value): value is z.input<S> => schema.safeParse(value).success,
    { toCodecJson: () => undefined },
  );
}
function result<S extends z.ZodType>(schema: S) {
  return Schema.declareConstructor<z.output<S>>()(
    [],
    () => (input) => {
      const parsed = schema.safeParse(input);
      return parsed.success
        ? Effect.succeed(parsed.data)
        : Effect.fail(new SchemaIssue.InvalidValue({ message: parsed.error.message }, input));
    },
    { toCodecJson: () => undefined },
  );
}
export class RuntimeError extends Schema.TaggedError<RuntimeError>()('RuntimeError', {
  message: Schema.String,
}) {}

const id = z.object({ id: z.string().min(1) });
const projectId = z.object({ projectId: z.string() });
const threadId = z.object({ threadId: z.string() });
const receipt = z.object({ runId: z.string(), threadId: z.string(), digest: z.string() });
const task = z.object({ task: agentSchema });
const teams = z.object({ teams: z.array(resolvedTeamSchema) });
const projection = threadHistorySchema
  .extend({
    thread: threadHistorySchema.shape.thread.loose(),
    runs: z.array(threadHistorySchema.shape.runs.element.loose()),
    messages: z.array(threadHistorySchema.shape.messages.element.loose()),
  })
  .loose();

export const appQuerySchema = z.object({ statements: appStatementsSchema });
export const runtimeInputs = {
  'usage.agent': z.object({
    id: z.string().min(1),
    sinceDay: z.iso.date(),
    untilDay: z.iso.date(),
    timeZone: z.string().min(1),
  }),
  'database.tables': id,
  'database.rows': id.extend({
    table: z.string().min(1).max(300),
    offset: z.number().int().min(0).max(1_000_000_000).default(0),
    limit: z.number().int().min(1).max(100).default(50),
    sort: z
      .object({ column: z.string().min(1).max(300), direction: z.enum(['asc', 'desc']) })
      .nullable()
      .default(null),
  }),
  'apps.read': id,
  'apps.query': id.extend(appQuerySchema.shape),
  'apps.prompt': id.extend({
    prompt: appPromptSchema,
    requestId: z.string().min(1).max(200),
  }),
  'usage.factory': z.object({
    project: z.string().min(1),
    sinceDay: z.iso.date(),
    untilDay: z.iso.date(),
    timeZone: z.string().min(1),
  }),
  'pullRequests.list': z.object({
    project: z.string(),
    days: z.union([z.literal(1), z.literal(7), z.literal(30)]),
    scope: z.enum(['recent', 'open']).optional(),
  }),
  'marketplace.leaderboard': z.object({
    kind: marketplaceKindSchema.default('factory'),
    query: z.string().trim().max(120).default(''),
  }),
  'marketplace.show': marketplaceSelectionSchema.pick({ source: true }),
  'marketplace.add': marketplaceSelectionSchema.extend({
    projectId: z.string().min(1),
    revision: z.string(),
    previewRevision: z.string(),
  }),
  'factory.settings': factorySettingsInputSchema,
  'definitions.get': projectId,
  'definitions.save': definitionFilesSchema.extend({
    projectId: z.string(),
    revision: z.string().nullable(),
  }),
  'definitions.migrate': z.object({
    apply: z.boolean().default(false),
    settingsDirectory: z.string().optional(),
  }),
  'runtime.status': z.object({}),
  'teams.list': projectId,
  'teams.replace': projectId.extend({ teams: z.array(teamSetupSchema).max(100) }),
  'teams.run': projectId.extend({
    path: z.string(),
    member: z.string().optional(),
    text: z.string().trim().min(1).max(16000).optional(),
    requestId: z.string().min(1),
  }),
  'history.agent': id,
  'agents.list': z.object({}),
  'workspace.snapshot': z.object({}),
  'factory.runner': z.object({
    projectId: z.string(),
    enabled: z.boolean(),
    expectedRevision: z.string(),
  }),
  'factory.machine': z.object({
    projectId: z.string().min(1),
    enabled: z.boolean(),
    expectedRevision: z.string(),
  }),
  'projects.delete': id,
  'projects.upsert': projectSchema,
  'agents.upsert': upsertSchema,
  'agents.setEnabled': id.extend({
    enabled: z.boolean(),
    nextRunAt: z.iso.datetime().nullable().optional(),
  }),
  'agents.run': id.extend({ requestId: z.string().min(1) }),
  'agents.deliveries': id,
  'agents.webhookSecret': id.extend({ secret: z.string().min(16) }),
  'sessions.read': threadId,
  'sessions.projection': threadId,
  'sessions.send': sendSchema,
  'sessions.stop': threadId.extend({ agentId: z.string().optional() }),
  'migration.import': importSchema,
  'webhooks.receive': id.extend({
    token: z.string(),
    body: z.string().max(1_400_000),
    headers: z.record(z.string(), z.string()),
    requestId: z.string().max(200).optional(),
  }),
};

export const runtimeResults = {
  'database.tables': z.object({
    tables: z.array(z.object({ name: z.string(), kind: z.enum(['table', 'view']) })),
  }),
  'database.rows': z.object({
    columns: z.array(z.object({ name: z.string(), type: z.string(), primaryKey: z.boolean() })),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
    total: z.number().int().nonnegative(),
  }),
  'usage.agent': z.object({
    input: z.number(),
    cached: z.number(),
    cacheWrite: z.number(),
    output: z.number(),
    reasoning: z.number(),
    costUsd: z.number(),
    unpriced: z.number(),
    records: z.number(),
    total: z.number(),
    runs: z.number(),
    completed: z.number(),
    failed: z.number(),
    partial: z.boolean(),
    measuredTurns: z.number(),
    pricingAt: z.string().nullable(),
  }),
  'apps.read': z.object({ html: z.string(), revision: z.string() }),
  'apps.query': z.object({
    results: z.array(
      z.object({
        columns: z.array(z.string()),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
        changes: z.number(),
      }),
    ),
  }),
  'apps.prompt': receipt,
  'usage.factory': z.object({
    readAt: z.string(),
    buckets: z.array(
      z.object({
        day: z.string(),
        model: z.string(),
        totals: z.object({
          uncachedInputTokens: z.number(),
          cachedInputTokens: z.number(),
          cacheCreationTokens: z.number(),
          outputTokens: z.number(),
        }),
      }),
    ),
    sources: z.array(z.object({ status: z.enum(['ok', 'partial', 'missing']) })),
  }),
  'pullRequests.list': pullRequestResultSchema,
  'marketplace.leaderboard': marketplaceListingSchema,
  'marketplace.show': marketplacePreviewSchema,
  'marketplace.add': z.object({
    source: z.string(),
    kind: marketplaceKindSchema,
    name: z.string(),
    location: z.string(),
    revision: z.string(),
    imported: z.number(),
  }),
  'factory.settings': z.union([
    z.record(z.string(), z.union([agentAppearanceSchema, factoryProfileSchema])),
    z.array(scorerSchema),
    z.object({ ok: z.boolean() }),
  ]),
  'definitions.get': savedDefinitionSchema,
  'definitions.save': savedDefinitionSchema,
  'definitions.migrate': z.object({
    applied: z.boolean(),
    factories: z.array(
      z.object({ projectId: z.string(), location: z.string(), status: z.string() }),
    ),
  }),
  'runtime.status': z.object({
    owner: z.literal('openfactory'),
    directory: z.string(),
    agents: z.number(),
    active: z.number(),
  }),
  'teams.list': teams,
  'teams.replace': teams,
  'teams.run': task.extend(receipt.shape),
  'history.agent': z.object({ runs: z.array(agentRunSchema), truncated: z.boolean() }),
  'agents.list': z.object({ tasks: z.array(agentSchema) }),
  'workspace.snapshot': z.object({
    snapshot: z.object({
      projects: z.array(
        z.preprocess(
          migrateMachineAssignment,
          projectSchema.extend({
            repository: z.string().nullable().optional(),
            branch: z.string().nullable().optional(),
            commit: z.string().nullable().optional(),
          }),
        ),
      ),
      threads: z.array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            projectId: z.string(),
            createdAt: z.string(),
            agentIds: z.array(z.string()).optional(),
          })
          .loose(),
      ),
    }),
  }),
  'factory.runner': z.object({ enabled: z.boolean(), revision: z.string() }),
  'factory.machine': z.object({ enabled: z.boolean(), revision: z.string() }),
  'projects.delete': z.object({ deleted: z.boolean() }),
  'projects.upsert': projectSchema,
  'agents.upsert': task,
  'agents.setEnabled': task,
  'agents.run': task.extend(receipt.shape),
  'agents.deliveries': z.object({
    deliveries: z.array(deliverySchema.extend({ agentId: z.string() })),
  }),
  'agents.webhookSecret': z.object({ configured: z.boolean() }),
  'sessions.read': z.object({ projection }),
  'sessions.projection': projection,
  'sessions.send': receipt.extend({ accepted: z.boolean() }),
  'sessions.stop': z.object({ stopped: z.boolean() }),
  'migration.import': z.object({ imported: z.number(), paused: z.boolean() }),
  'webhooks.receive': z.union([
    z.object({ status: z.literal(202), runId: z.string(), threadId: z.string() }),
    z.object({ status: z.number(), error: z.string() }),
  ]),
} satisfies Record<keyof typeof runtimeInputs, z.ZodType>;

function procedure<const Name extends string, Input extends z.ZodType, Output extends z.ZodType>(
  name: Name,
  input: Input,
  output: Output,
) {
  return Rpc.make(name, { payload: payload(input), success: result(output), error: RuntimeError });
}

export const runtimeProcedures = {
  'database.tables': procedure(
    'database.tables',
    runtimeInputs['database.tables'],
    runtimeResults['database.tables'],
  ),
  'database.rows': procedure(
    'database.rows',
    runtimeInputs['database.rows'],
    runtimeResults['database.rows'],
  ),
  'usage.agent': procedure(
    'usage.agent',
    runtimeInputs['usage.agent'],
    runtimeResults['usage.agent'],
  ),
  'apps.read': procedure('apps.read', runtimeInputs['apps.read'], runtimeResults['apps.read']),
  'apps.query': procedure('apps.query', runtimeInputs['apps.query'], runtimeResults['apps.query']),
  'apps.prompt': procedure(
    'apps.prompt',
    runtimeInputs['apps.prompt'],
    runtimeResults['apps.prompt'],
  ),
  'usage.factory': procedure(
    'usage.factory',
    runtimeInputs['usage.factory'],
    runtimeResults['usage.factory'],
  ),
  'pullRequests.list': procedure(
    'pullRequests.list',
    runtimeInputs['pullRequests.list'],
    runtimeResults['pullRequests.list'],
  ),
  'marketplace.leaderboard': procedure(
    'marketplace.leaderboard',
    runtimeInputs['marketplace.leaderboard'],
    runtimeResults['marketplace.leaderboard'],
  ),
  'marketplace.show': procedure(
    'marketplace.show',
    runtimeInputs['marketplace.show'],
    runtimeResults['marketplace.show'],
  ),
  'marketplace.add': procedure(
    'marketplace.add',
    runtimeInputs['marketplace.add'],
    runtimeResults['marketplace.add'],
  ),
  'factory.settings': procedure(
    'factory.settings',
    runtimeInputs['factory.settings'],
    runtimeResults['factory.settings'],
  ),
  'definitions.get': procedure(
    'definitions.get',
    runtimeInputs['definitions.get'],
    runtimeResults['definitions.get'],
  ),
  'definitions.save': procedure(
    'definitions.save',
    runtimeInputs['definitions.save'],
    runtimeResults['definitions.save'],
  ),
  'definitions.migrate': procedure(
    'definitions.migrate',
    runtimeInputs['definitions.migrate'],
    runtimeResults['definitions.migrate'],
  ),
  'runtime.status': procedure(
    'runtime.status',
    runtimeInputs['runtime.status'],
    runtimeResults['runtime.status'],
  ),
  'teams.list': procedure('teams.list', runtimeInputs['teams.list'], runtimeResults['teams.list']),
  'teams.replace': procedure(
    'teams.replace',
    runtimeInputs['teams.replace'],
    runtimeResults['teams.replace'],
  ),
  'teams.run': procedure('teams.run', runtimeInputs['teams.run'], runtimeResults['teams.run']),
  'history.agent': procedure(
    'history.agent',
    runtimeInputs['history.agent'],
    runtimeResults['history.agent'],
  ),
  'agents.list': procedure(
    'agents.list',
    runtimeInputs['agents.list'],
    runtimeResults['agents.list'],
  ),
  'workspace.snapshot': procedure(
    'workspace.snapshot',
    runtimeInputs['workspace.snapshot'],
    runtimeResults['workspace.snapshot'],
  ),
  'factory.runner': procedure(
    'factory.runner',
    runtimeInputs['factory.runner'],
    runtimeResults['factory.runner'],
  ),
  'factory.machine': procedure(
    'factory.machine',
    runtimeInputs['factory.machine'],
    runtimeResults['factory.machine'],
  ),
  'projects.delete': procedure(
    'projects.delete',
    runtimeInputs['projects.delete'],
    runtimeResults['projects.delete'],
  ),
  'projects.upsert': procedure(
    'projects.upsert',
    runtimeInputs['projects.upsert'],
    runtimeResults['projects.upsert'],
  ),
  'agents.upsert': procedure(
    'agents.upsert',
    runtimeInputs['agents.upsert'],
    runtimeResults['agents.upsert'],
  ),
  'agents.setEnabled': procedure(
    'agents.setEnabled',
    runtimeInputs['agents.setEnabled'],
    runtimeResults['agents.setEnabled'],
  ),
  'agents.run': procedure('agents.run', runtimeInputs['agents.run'], runtimeResults['agents.run']),
  'agents.deliveries': procedure(
    'agents.deliveries',
    runtimeInputs['agents.deliveries'],
    runtimeResults['agents.deliveries'],
  ),
  'agents.webhookSecret': procedure(
    'agents.webhookSecret',
    runtimeInputs['agents.webhookSecret'],
    runtimeResults['agents.webhookSecret'],
  ),
  'sessions.read': procedure(
    'sessions.read',
    runtimeInputs['sessions.read'],
    runtimeResults['sessions.read'],
  ),
  'sessions.projection': procedure(
    'sessions.projection',
    runtimeInputs['sessions.projection'],
    runtimeResults['sessions.projection'],
  ),
  'sessions.send': procedure(
    'sessions.send',
    runtimeInputs['sessions.send'],
    runtimeResults['sessions.send'],
  ),
  'sessions.stop': procedure(
    'sessions.stop',
    runtimeInputs['sessions.stop'],
    runtimeResults['sessions.stop'],
  ),
  'migration.import': procedure(
    'migration.import',
    runtimeInputs['migration.import'],
    runtimeResults['migration.import'],
  ),
  'webhooks.receive': procedure(
    'webhooks.receive',
    runtimeInputs['webhooks.receive'],
    runtimeResults['webhooks.receive'],
  ),
};

export const RuntimeRpcs = RpcGroup.make(...Object.values(runtimeProcedures));

export const RemoteRuntimeRpcs = RuntimeRpcs.omit('migration.import', 'definitions.migrate');
export type RuntimeMethod = keyof typeof runtimeInputs;
export type RuntimePayload<M extends RuntimeMethod> = Rpc.PayloadConstructor<
  Rpc.ExtractTag<RpcGroup.Rpcs<typeof RuntimeRpcs>, M>
>;
