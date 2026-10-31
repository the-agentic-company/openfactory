import { agentAppearanceSchema } from '@openfactory/core';
import { z } from 'zod';

export const factoryProfileSchema = z.object({
  title: z.string().trim().min(1).max(80),
  icon: agentAppearanceSchema,
});
export type FactoryProfile = z.infer<typeof factoryProfileSchema>;
