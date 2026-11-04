import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { loadAgentUsage } from '@openfactory/runtime/agent-usage';
import { loadAgentProjections } from './agent-projections.server';

export const getAgentUsage = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      id: z.string().min(1),
      sinceDay: z.iso.date(),
      untilDay: z.iso.date(),
      timeZone: z.string().min(1),
    }),
  )
  .handler(({ data }) => loadAgentUsage(data, loadAgentProjections));
