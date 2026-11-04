import { z } from 'zod';
import { agentAppearanceSchema } from '@openfactory/core';

const section = z.enum(['appearances', 'factories', 'scorers']);
const id = z.string().min(1).max(4096);
export const factorySettingsInputSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('read'), section, ids: z.array(id).max(1000).optional() }),
  z.object({ operation: z.literal('write'), section, id, value: z.unknown() }),
  z.object({ operation: z.literal('remove'), section, id }),
]);
export const factoryProfileSchema = z.object({
  title: z.string().trim().min(1).max(80),
  icon: agentAppearanceSchema,
});
