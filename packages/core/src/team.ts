import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import { agentSchema } from './agents';

export const agentFilePathSchema = z
  .string()
  .regex(/^agents\/[A-Za-z0-9%_.!~*'()-]+\/agent\.md$/)
  .refine((path) => !path.split('/').some((part) => part === '.' || part === '..'));
export const teamFilePathSchema = z.string().regex(/^teams\/[a-z][a-z0-9-]*\/team\.yaml$/);
const memberIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(60);
export const teamSchema = z
  .strictObject({
    schemaVersion: z.literal('v1alpha1'),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(400),
    instructions: z.literal('./instructions.md').optional(),
    lead: memberIdSchema,
    members: z.record(
      memberIdSchema,
      z.strictObject({
        agent: agentFilePathSchema,
        reportsTo: memberIdSchema.optional(),
      }),
    ),
  })
  .superRefine((team, ctx) => {
    const entries = Object.entries(team.members);
    if (entries.length < 1 || entries.length > 24) {
      ctx.addIssue({ code: 'custom', message: 'Define between 1 and 24 team members.' });
    }
    if (!Object.hasOwn(team.members, team.lead)) {
      ctx.addIssue({ code: 'custom', message: 'The lead must name a team member.' });
    }
    const paths = new Set<string>();
    for (const [id, member] of entries) {
      if (paths.has(member.agent)) {
        ctx.addIssue({ code: 'custom', message: `Agent ${member.agent} appears more than once.` });
      }
      paths.add(member.agent);
      if (id === team.lead ? Boolean(member.reportsTo) : !member.reportsTo) {
        ctx.addIssue({ code: 'custom', message: 'Only the team lead can omit reportsTo.' });
      }
      if (member.reportsTo && !Object.hasOwn(team.members, member.reportsTo)) {
        ctx.addIssue({
          code: 'custom',
          message: `${id} reports to unknown member ${member.reportsTo}.`,
        });
      }
      const visited = new Set<string>();
      let current: string | undefined = id;
      while (current) {
        if (visited.has(current)) {
          ctx.addIssue({ code: 'custom', message: `Reporting cycle involving ${id}.` });
          break;
        }
        visited.add(current);
        current = Object.hasOwn(team.members, current)
          ? team.members[current]?.reportsTo
          : undefined;
      }
    }
  });
export type TeamDefinition = z.infer<typeof teamSchema>;

export function parseTeamYaml(source: string): TeamDefinition {
  if (source.length > 100000) {
    throw new Error('Keep the team file under 100 KB.');
  }
  const document = parseDocument(source, { uniqueKeys: true, stringKeys: true });
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem) {
    throw new Error(problem.message);
  }
  return teamSchema.parse(document.toJS({ maxAliasCount: 0 }));
}

export function stringifyTeamDefinition(definition: TeamDefinition): string {
  return stringify(teamSchema.parse(definition));
}

export const teamSetupSchema = z.object({
  path: teamFilePathSchema,
  source: z.string().max(100000),
  instructions: z.string().max(16000),
  bindings: z.record(agentFilePathSchema, z.string().min(1)),
});
export type TeamSetup = z.infer<typeof teamSetupSchema>;
export const resolvedTeamSchema = z.object({
  path: teamFilePathSchema,
  source: z.string(),
  instructions: z.string(),
  definition: teamSchema,
  agents: z.array(
    z.object({
      id: memberIdSchema,
      agentPath: agentFilePathSchema,
      reportsTo: memberIdSchema.optional(),
      agent: agentSchema,
    }),
  ),
});
export type AgentTeam = z.infer<typeof resolvedTeamSchema>;
export type TeamAgent = AgentTeam['agents'][number];

export function resolveTeam(setup: TeamSetup, agents: z.infer<typeof agentSchema>[]): AgentTeam {
  const definition = parseTeamYaml(setup.source);
  if (!definition.instructions && setup.instructions) {
    throw new Error('Declare instructions in team.yaml before supplying shared guidance.');
  }
  const ids = Object.values(definition.members)
    .map((member) => setup.bindings[member.agent])
    .filter((id) => id !== undefined);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Each team member must reference a different runtime agent.');
  }
  return {
    ...setup,
    definition,
    agents: Object.entries(definition.members).map(([id, member]) => {
      const agentId = setup.bindings[member.agent];
      const agent = agents.find((item) => item.id === agentId);
      if (!agent) {
        throw new Error(`${setup.path}: ${id} references an unavailable agent: ${member.agent}`);
      }
      return { id, agentPath: member.agent, reportsTo: member.reportsTo, agent };
    }),
  };
}

export function factoryTeamSetups(
  files: Record<string, string>,
  bindings: Record<string, string>,
): TeamSetup[] {
  return Object.entries(files)
    .filter(([path]) => teamFilePathSchema.safeParse(path).success)
    .map(([path, source]) => {
      const definition = parseTeamYaml(source);
      const instructionsPath = path.replace(/team\.yaml$/, 'instructions.md');
      if (definition.instructions && files[instructionsPath] === undefined) {
        throw new Error(`${path}: missing ${instructionsPath}`);
      }
      const memberBindings: Record<string, string> = {};
      for (const member of Object.values(definition.members)) {
        const id = bindings[member.agent];
        if (!id || files[member.agent] === undefined) {
          throw new Error(`${path}: missing agent definition or runtime binding: ${member.agent}`);
        }
        memberBindings[member.agent] = id;
      }
      return teamSetupSchema.parse({
        path,
        source,
        instructions: definition.instructions ? files[instructionsPath] : '',
        bindings: memberBindings,
      });
    });
}

export function teamGuidance(team: AgentTeam, memberId: string): string {
  return [
    `Team: ${team.definition.name} (${team.path})`,
    team.definition.description,
    `Your team member ID: ${memberId}. Team lead: ${team.definition.lead}.`,
    'Reporting relationships describe organization; they do not grant extra permissions or deployment approval.',
    ...team.agents.map(
      (member) =>
        `${member.id}: ${member.agent.title}${member.reportsTo ? `; reports to ${member.reportsTo}` : '; lead'}`,
    ),
    team.instructions,
  ]
    .filter(Boolean)
    .join('\n');
}
