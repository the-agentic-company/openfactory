import { z } from 'zod';

export const identitySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  version: z.literal(1),
});
export const factorySchema = z.object({ id: z.uuid(), name: z.string(), directory: z.string() });
export const agentSchema = z.object({
  id: z.uuid(),
  factoryId: z.uuid(),
  name: z.string(),
  prompt: z.string().max(32000),
  sandbox: z.enum(['read-only', 'workspace-write']),
  intervalMinutes: z.number().int().positive().nullable(),
  enabled: z.boolean(),
  nextRunAt: z.number().nullable(),
});
export const runSchema = z.object({
  requestId: z.string().optional(),
  messageId: z.string().optional(),
  id: z.uuid(),
  agentId: z.uuid(),
  factoryId: z.uuid(),
  agentName: z.string(),
  directory: z.string(),
  prompt: z.string().max(32000),
  sandbox: z.enum(['read-only', 'workspace-write']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted']),
  output: z.string().max(100000),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
const peerSchema = z.object({ id: z.uuid(), name: z.string(), createdAt: z.string() });
export const stateSchema = z.object({
  host: identitySchema,
  factories: z.array(factorySchema),
  agents: z.array(agentSchema),
  runs: z.array(runSchema),
  peers: z.array(peerSchema),
  provider: z.object({ name: z.string(), ready: z.boolean() }),
  address: z.string().nullable(),
  background: z.literal(true),
});
export const persistedHostSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  name: z.string(),
  address: z.string().optional(),
  factories: z.array(factorySchema),
  agents: z.array(agentSchema),
  runs: z.array(runSchema),
  peers: z.array(peerSchema.extend({ digest: z.string().regex(/^[a-f0-9]{64}$/) })),
});
