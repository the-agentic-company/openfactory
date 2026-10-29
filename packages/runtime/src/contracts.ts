import { agentSchema, scheduleSchema, threadHistorySchema } from '@openfactory/core';
import { z } from 'zod';

export const projectSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  workspaceRoot: z.string().min(1),
});
export const modelSchema = z.object({
  instanceId: z.enum(['codex', 'claude', 'claude-code']),
  model: z.string().trim().min(1),
  options: z
    .union([
      z.record(z.string(), z.unknown()),
      z.array(z.object({ id: z.string(), value: z.unknown() })),
    ])
    .transform((value) =>
      Array.isArray(value)
        ? Object.fromEntries(value.map((option) => [option.id, option.value]))
        : value,
    )
    .optional(),
});
export const runtimeModeSchema = z.enum(['approval-required', 'auto-accept-edits', 'full-access']);
export const workspaceStrategySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('root'), branch: z.string().optional() }),
  z.object({ type: z.literal('existing_worktree'), worktreePath: z.string() }),
  z.object({
    type: z.literal('worktree'),
    baseRef: z.string().default('HEAD'),
    branch: z.string().optional(),
    startFromOrigin: z.boolean().optional(),
  }),
]);
export const ownedAgentSchema = agentSchema.extend({
  schedule: scheduleSchema,
  modelSelection: modelSchema,
  runtimeMode: runtimeModeSchema.default('approval-required'),
  interactionMode: z.enum(['default', 'plan']).default('default'),
  workspaceStrategy: workspaceStrategySchema.default({ type: 'root' }),
});
export type OwnedAgent = z.infer<typeof ownedAgentSchema>;
export const usageSchema = z.object({
  input: z.number(),
  cached: z.number(),
  cacheWrite: z.number(),
  output: z.number(),
  costUsd: z.number().nullable(),
});
export const runSchema = threadHistorySchema.shape.runs.element.extend({
  status: z.enum(['queued', 'running', 'completed', 'failed', 'interrupted']),
  threadId: z.string(),
  agentId: z.string(),
  modelSelection: modelSchema,
  error: z.string().nullable(),
  usage: usageSchema.nullable(),
});
export type OwnedRun = z.infer<typeof runSchema>;
export const messageSchema = threadHistorySchema.shape.messages.element.extend({
  attachments: z.array(z.never()).default([]),
});
export const sessionSchema = z.object({
  thread: z.object({
    id: z.string(),
    title: z.string(),
    projectId: z.string(),
    createdAt: z.string(),
    runtime: z.literal('openfactory'),
    agentId: z.string(),
  }),
  nativeSessionId: z.string().nullable(),
  codexUsageTotals: usageSchema.nullable().default(null),
  cwd: z.string(),
  workspacePrepared: z.boolean().default(false),
  modelSelection: modelSchema,
  runtimeMode: runtimeModeSchema,
  interactionMode: z.enum(['default', 'plan']),
  workspaceStrategy: workspaceStrategySchema,
});
export type Session = z.infer<typeof sessionSchema>;
export const upsertSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(16000),
  projectId: z.string(),
  schedule: scheduleSchema,
  enabled: z.boolean(),
  modelSelection: modelSchema,
  runtimeMode: runtimeModeSchema,
  interactionMode: z.enum(['default', 'plan']),
  workspaceStrategy: workspaceStrategySchema,
  expectedSource: z.string().optional(),
});
export const importSchema = z.object({
  projects: z.array(projectSchema),
  agents: z.array(ownedAgentSchema),
  histories: z
    .array(
      threadHistorySchema.extend({
        thread: threadHistorySchema.shape.thread.extend({ projectId: z.string() }),
      }),
    )
    .default([]),
});
export const sendSchema = z.object({
  threadId: z.string(),
  text: z.string().trim().min(1).max(16000),
  messageId: z.string().min(1).max(300),
  agentId: z.string().optional(),
});
