import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const getTokenUsage = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      project: z
        .string()
        .min(1)
        .refine((value) => value !== 'all', 'Select a factory.'),
      sinceDay: z.iso.date(),
      untilDay: z.iso.date(),
      timeZone: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { loadFactoryUsage } = await import('./factory-usage.server');
    return loadFactoryUsage(data);
  });
