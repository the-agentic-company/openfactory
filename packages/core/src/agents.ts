import { z } from 'zod';

export const scheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({ type: z.literal('interval'), everyMs: z.number().int().min(60000) }),
  z.object({
    type: z.literal('fixed_time'),
    timeOfDay: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  }),
  z.object({
    type: z.literal('webhook'),
    signature: z
      .object({ header: z.string(), encoding: z.enum(['hex', 'base64']), prefix: z.string() })
      .nullable()
      .optional(),
  }),
]);
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
export const agentSchema = z.object({
  id: z.string(),
  projectName: z.string().default('Unassigned'),
  projectPath: z.string().nullable().default(null),
  title: z.string(),
  prompt: z.string(),
  enabled: z.boolean(),
  schedule: scheduleSchema,
  runtimeMode: z.enum(['approval-required', 'auto-accept-edits', 'full-access']).optional(),
  projectId: z.string(),
  threadId: z.string().nullable(),
  modelSelection: z.object({
    instanceId: z.string(),
    model: z.string(),
    options: z.record(z.string(), z.json()).optional(),
  }),
  interactionMode: z.enum(['default', 'plan']).optional(),
  workspaceStrategy: workspaceStrategySchema.optional(),
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastRunStatus: z.enum(['never', 'running', 'succeeded', 'failed']),
  lastRunError: z.string().nullable(),
  runCount: z.number(),
  webhook: z.object({ url: z.string().nullable(), hasSecret: z.boolean() }).optional(),
});
export type Agent = z.infer<typeof agentSchema>;
export const deliverySchema = z.object({
  id: z.string(),
  receivedAt: z.string(),
  outcome: z.string(),
  error: z.string().nullable(),
  method: z.string(),
  bodyBytes: z.number(),
});
export type Delivery = z.infer<typeof deliverySchema>;
export function scheduleLabel(schedule: Agent['schedule']) {
  if (schedule.type === 'manual') {
    return 'Manual runs';
  }
  if (schedule.type === 'webhook') {
    return 'On webhook request';
  }
  if (schedule.type === 'fixed_time') {
    return `${schedule.timeOfDay} · ${schedule.weekdays?.length ? 'Selected days' : 'Every day'}`;
  }
  const minutes = schedule.everyMs / 60_000;
  if (minutes < 60) {
    return minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`;
  }
  if (minutes < 1440) {
    return minutes === 60 ? 'Every hour' : `Every ${minutes / 60} hours`;
  }
  return minutes === 1440 ? 'Every day' : `Every ${minutes / 1440} days`;
}
