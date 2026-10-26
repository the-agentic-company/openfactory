import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { applyAgentDefinition } from './apply-agent-definition.server';

const definitionInput = z.object({
  id: z.string().min(1),
  source: z.string().max(20000),
  expectedSource: z.string().max(20000),
});

export const saveAgentDefinition = createServerFn({ method: 'POST' })
  .validator(definitionInput)
  .handler(({ data }) => applyAgentDefinition(data));
