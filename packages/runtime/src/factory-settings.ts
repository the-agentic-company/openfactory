import {
  agentAppearanceSchema,
  factoryYamlSchema,
  scorerSchema,
  updateFactoryYaml,
  validateFactoryFile,
} from '@openfactory/core';
import { z } from 'zod';
import { ownedAgentSchema, projectSchema } from './contracts';
import { readDefinition, type DefinitionFiles } from './definition-store';
import { Store } from './store';

const section = z.enum(['appearances', 'factories', 'scorers']);
const id = z.string().min(1).max(4096);
const inputSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('read'), section, ids: z.array(id).max(1000).optional() }),
  z.object({ operation: z.literal('write'), section, id, value: z.unknown() }),
  z.object({ operation: z.literal('remove'), section, id }),
]);
export const factoryProfileSchema = z.object({
  title: z.string().trim().min(1).max(80),
  icon: agentAppearanceSchema,
});
export async function factorySettings(
  store: Store,
  raw: unknown,
  save: (projectId: string, revision: string, definition: DefinitionFiles) => Promise<unknown>,
) {
  const input = inputSchema.parse(raw);
  const definitions = store.all('projects', projectSchema).map((project) => {
    const definition = readDefinition(project.workspaceRoot);
    if (!definition) {
      throw new Error(
        `${project.workspaceRoot}/factory/factory.yaml is missing. Migrate existing factories first.`,
      );
    }
    const factory = factoryYamlSchema.parse(
      validateFactoryFile('factory.yaml', definition.files['factory.yaml'] ?? ''),
    );
    return { project, definition, factory };
  });
  if (input.operation === 'read') {
    if (input.section === 'scorers') {
      return definitions.flatMap(({ factory, project }) =>
        (factory.scorers ?? []).map((scorer) => ({ ...scorer, project: project.workspaceRoot })),
      );
    }
    const values: Record<string, unknown> = {};
    for (const { project, definition, factory } of definitions) {
      if (input.section === 'factories' && input.ids?.includes(project.id)) {
        values[project.id] = {
          title: factory.name,
          icon: factory.icon ?? { kind: 'icon', name: 'factory' },
        };
      }
      if (input.section === 'appearances') {
        for (const agentId of Object.values(definition.bindings)) {
          if (input.ids?.includes(agentId) && factory.agentAppearances?.[agentId]) {
            values[agentId] = factory.agentAppearances[agentId];
          }
        }
      }
    }
    return values;
  }
  const scorer =
    input.section === 'scorers' && input.operation === 'write'
      ? scorerSchema.parse(input.value)
      : null;
  const owner =
    input.section === 'appearances'
      ? store.get('agents', input.id, ownedAgentSchema)?.projectId
      : null;
  const selected = definitions.find(({ project, definition, factory }) =>
    input.section === 'factories'
      ? project.id === input.id
      : input.section === 'appearances'
        ? project.id === owner && Object.values(definition.bindings).includes(input.id)
        : scorer
          ? project.id === scorer.project || project.workspaceRoot === scorer.project
          : factory.scorers?.some((item) => item.id === input.id),
  );
  if (!selected) {
    throw new Error('Choose a factory in an existing repository.');
  }
  const { project, definition, factory } = selected;
  let changes: Partial<z.infer<typeof factoryYamlSchema>>;
  if (input.section === 'factories' && input.operation === 'write') {
    const profile = factoryProfileSchema.parse(input.value);
    changes = { name: profile.title, icon: profile.icon };
  } else if (input.section === 'appearances' && input.operation === 'write') {
    changes = {
      agentAppearances: {
        ...factory.agentAppearances,
        [input.id]: agentAppearanceSchema.parse(input.value),
      },
    };
  } else if (input.section === 'scorers') {
    const scorers = (factory.scorers ?? []).filter((item) => item.id !== input.id);
    if (scorer) {
      if (
        scorer.id !== input.id ||
        (scorer.agentId && !Object.values(definition.bindings).includes(scorer.agentId))
      ) {
        throw new Error('Choose an agent from this factory.');
      }
      const { project: _scope, ...scorerDefinition } = scorer;
      scorers.push(scorerDefinition);
    }
    changes = { scorers };
  } else {
    throw new Error('Unsupported factory settings operation.');
  }
  const source = updateFactoryYaml(definition.files['factory.yaml'] ?? '', changes);
  await save(project.id, definition.revision, {
    files: { ...definition.files, 'factory.yaml': source },
  });
  return { ok: true };
}
