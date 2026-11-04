import { z } from 'zod';
export const appStatementsSchema = z
  .array(
    z.object({
      sql: z.string().trim().min(1).max(20000),
      args: z.array(z.union([z.string().max(100000), z.number().finite(), z.null()])).max(200),
    }),
  )
  .min(1)
  .max(50);
export const appPromptSchema = z.string().trim().min(1).max(16000);

export const appBridgeRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('openfactory:database-query'),
    version: z.literal(1),
    requestId: z.string().min(1).max(200),
    statements: appStatementsSchema,
  }),
  z.object({
    type: z.literal('openfactory:agent-prompt'),
    version: z.literal(1),
    requestId: z.string().min(1).max(200),
    prompt: appPromptSchema,
  }),
]);
