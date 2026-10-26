import { parseDocument } from 'yaml';
import { z } from 'zod';

const triggerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('manual') }),
  z.strictObject({ type: z.literal('delegated') }),
  z.strictObject({ type: z.literal('interval'), hours: z.number().int().min(1).max(8760) }),
  z.strictObject({
    type: z.literal('daily'),
    at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00'),
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Use a valid timezone, such as Europe/Paris'),
  }),
]);
const agentSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(60),
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().min(1).max(120),
  reports_to: z.string().optional(),
  model: z.string().trim().min(1).max(100),
  trigger: triggerSchema,
  prompt: z.string().trim().min(1).max(16000),
});
export const teamSchema = z
  .strictObject({
    version: z.literal(1),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(400),
    project: z.string().startsWith('/').max(500),
    workspace: z.string().startsWith('/').max(500),
    agents: z.array(agentSchema).min(1).max(24),
  })
  .superRefine((team, ctx) => {
    const ids = new Set<string>();
    for (const agent of team.agents) {
      if (ids.has(agent.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate agent id: ${agent.id}` });
      }
      ids.add(agent.id);
    }
    if (team.agents.filter((agent) => !agent.reports_to).length !== 1) {
      ctx.addIssue({ code: 'custom', message: 'Define exactly one team lead without reports_to.' });
    }
    const parents = new Map(team.agents.map((agent) => [agent.id, agent.reports_to]));
    for (const agent of team.agents) {
      if (agent.reports_to && !ids.has(agent.reports_to)) {
        ctx.addIssue({
          code: 'custom',
          message: `${agent.id} reports to unknown agent ${agent.reports_to}.`,
        });
      }
      const visited = new Set<string>();
      let current: string | undefined = agent.id;
      while (current) {
        if (visited.has(current)) {
          ctx.addIssue({ code: 'custom', message: `Reporting cycle involving ${agent.id}.` });
          break;
        }
        visited.add(current);
        current = parents.get(current);
      }
    }
  });
export type AgentTeam = z.infer<typeof teamSchema>;
export type TeamAgent = AgentTeam['agents'][number];

export function parseTeamYaml(source: string): AgentTeam {
  if (source.length > 100000) {
    throw new Error('Keep the team file under 100 KB.');
  }
  const document = parseDocument(source, { uniqueKeys: true, stringKeys: true });
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem) {
    throw new Error(problem.message);
  }
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  const result = teamSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'team'}: ${issue.message}`)
        .join('\n'),
    );
  }
  return result.data;
}

export function teamTriggerLabel(trigger: TeamAgent['trigger']): string {
  switch (trigger.type) {
    case 'manual':
      return 'On demand';
    case 'delegated':
      return 'When delegated';
    case 'interval':
      return `Every ${trigger.hours} hours`;
    case 'daily':
      return `Daily at ${trigger.at}`;
  }
}
